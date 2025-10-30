import api, { route } from "@forge/api";
import { kvs, WhereConditions  } from '@forge/kvs'; 
import { fetchAndCalculateAgents } from './agent-logic'; // <-- Reutilizamos la lógica de agentes
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Se ejecuta cuando se crea una nueva solicitud.
 */
export const issueCreatedHandler = async (event, context) => {
  const issueId = event.issue.id;
  const issueKey = event.issue.key;
  const projectKey = event.issue.fields.project.key;
  const AREA_CUSTOM_FIELD_ID = process.env.AREA_FIELD_ID;

  console.log(`Nueva solicitud creada [${issueKey}]. Iniciando automatización.`);

  try {

    const issueResponse = await api.asApp().requestJira(route`/rest/api/3/issue/${issueId}?fields=${AREA_CUSTOM_FIELD_ID}`);
    if (!issueResponse.ok) {
        throw new Error("No se pudo re-leer la información de la solicitud.");
    }
    const freshIssueData = await issueResponse.json();
    
    const areaOptions = freshIssueData.fields[AREA_CUSTOM_FIELD_ID];
    if (!areaOptions || areaOptions.length === 0) {
      console.log(`La solicitud [${issueKey}] no tiene un "Área de Asignación". Saliendo.`);
      return;
    }
    const requiredAreas = areaOptions.map(option => option.value);
    console.log(`Áreas requeridas para la asignación: [${requiredAreas.join(', ')}]`);

    // 1. OBTENER TODOS LOS AGENTES
    const allAgents = await fetchAndCalculateAgents(projectKey);
    if (allAgents.length === 0) {
      console.log("No se encontraron agentes. Saliendo.");
      return;
    }
    const eligibleAgents = allAgents.filter(agent => requiredAreas.includes(agent.area));
    
    if (eligibleAgents.length === 0) {
      console.log(`No se encontraron agentes disponibles en ninguna de las áreas requeridas: [${requiredAreas.join(', ')}]. Saliendo.`);
      return;
    }
    
    console.log(`Encontrados ${eligibleAgents.length} agentes elegibles. El más disponible es: ${eligibleAgents[0].nombre}`);

    // 2. OBTENER Y CALCULAR EL TIEMPO REQUERIDO (LA MITAD DEL SLA)
    let timeToEstimateInSeconds = 0;
    try {
      const slaResponse = await api.asApp().requestJira(route`/rest/servicedeskapi/request/${issueId}/sla`);
      const slaData = await slaResponse.json();
      const resolutionSla = slaData.values?.find(sla => sla.name.includes('Time to resolution'));
      if (resolutionSla && resolutionSla.ongoingCycle) {
        // Usamos la mitad del tiempo total del SLA
        timeToEstimateInSeconds = (resolutionSla.ongoingCycle.remainingTime.millis / 1000) / 2;
        console.log(`La mitad del SLA de resolución es: ${timeToEstimateInSeconds} segundos.`);
      } else {
        console.log("No se encontró un SLA de resolución. La estimación quedará en 0.");
      }
    } catch (slaError) {
      console.warn("No se pudo obtener la información del SLA. La estimación será 0.", slaError);
    }
    const requiredTimeInHours = timeToEstimateInSeconds / 3600;

    // 3. BUCLE PARA ENCONTRAR Y ASIGNAR AL AGENTE CORRECTO
    let assignmentSuccessful = false;
    for (const agent of eligibleAgents) {
      console.log(`\nVerificando agente: ${agent.nombre} (Disponibilidad: ${agent.disponibilidadNum.toFixed(2)}%)`);
      
      const availableHours = agent.capacidadSemanalHoras - agent.cargaTotalHoras;

      // COMPROBACIÓN: ¿Tiene el agente suficientes horas disponibles?
      if (availableHours >= requiredTimeInHours) {
        console.log(`-> Capacidad suficiente: ${availableHours.toFixed(2)}h disponibles >= ${requiredTimeInHours.toFixed(2)}h requeridas.`);
        
        try {
          const updateResponse = await api.asApp().requestJira(route`/rest/api/3/issue/${issueId}`, {
            method: 'PUT',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fields: {
                assignee: { accountId: agent.id },
              }
            })
          });

          if (updateResponse.ok) {
            console.log(`✅ ÉXITO: Solicitud [${issueKey}] asignada a ${agent.nombre}.`);
            assignmentSuccessful = true;
            break; 
          } else {
            console.warn(`⚠️ FALLO al asignar a ${agent.nombre}:`, await updateResponse.text());
          }
        } catch (apiError) {
          console.warn(`⚠️ ERROR DE API al intentar asignar a ${agent.nombre}:`, apiError);
        }
      } else {
        console.log(`-> Capacidad insuficiente: ${availableHours.toFixed(2)}h disponibles < ${requiredTimeInHours.toFixed(2)}h requeridas.`);
      }
    }

    if (!assignmentSuccessful) {
      console.log("Asignación finalizada: No se encontró ningún agente con capacidad suficiente o todas las asignaciones fallaron.");
    }

  } catch (error) {
    console.error(`Error fatal en la automatización para la solicitud [${issueKey}]:`, error);
  }
};



export const worklogUpdatedHandler = async (event, context) => {
  const issueId = event.worklog.issueId; 
  console.log(`Evento de registro de tiempo detectado en la incidencia [${issueId}]. Calculando costo...`);

  try {
    // 1. Obtenemos el asignado y el tiempo total empleado de la solicitud
    const issueResponse = await api.asApp().requestJira(route`/rest/api/3/issue/${issueId}?fields=assignee,timetracking`);
    if (!issueResponse.ok) {
      console.error("No se pudo obtener la información de la solicitud.");
      return;
    }
    const issueDetails = await issueResponse.json();

    const assigneeId = issueDetails.fields.assignee?.accountId;
    const totalTimeSpentSeconds = issueDetails.fields.timetracking?.timeSpentSeconds || 0;

    if (!assigneeId) {
      console.log(`La solicitud [${issueId}] no tiene un asignado. No se puede calcular el costo.`);
      return;
    }

    // 2. Obtenemos el salario por hora del agente desde KVS
    const agentData = await kvs.get(`agent-${assigneeId}`);
    const salarioPorHora = agentData?.salarioPorHora;

    if (!salarioPorHora || salarioPorHora === 0) {
      console.log(`El agente asignado a [${issueId}] no tiene un salario por hora registrado.`);
      return;
    }

    // 3. Calculamos el costo
    const totalTimeSpentHours = totalTimeSpentSeconds / 3600;
    const costoCalculado = totalTimeSpentHours * salarioPorHora;
    console.log(`Cálculo: ${totalTimeSpentHours.toFixed(2)}h * $${salarioPorHora}/h = $${costoCalculado.toFixed(2)}`);

    // 4. Actualizamos el campo personalizado "Costo empleado"
    const fieldIdForCost = process.env.COST_FIELD_ID; 

    const updatePayload = {
      fields: {
        [fieldIdForCost]: costoCalculado
      }
    };

    const updateResponse = await api.asApp().requestJira(route`/rest/api/3/issue/${issueId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatePayload)
    });

    if (updateResponse.ok) {
      console.log(`Campo "Costo empleado" actualizado a ${costoCalculado.toFixed(2)} en [${issueId}].`);
    } else {
      console.error(`Falló la actualización del costo en [${issueId}]:`, await updateResponse.text());
    }

  } catch (error) {
    console.error(`Error fatal en la automatización de costo para [${issueId}]:`, error);
  }
};