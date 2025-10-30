import api, { route } from "@forge/api";
import Resolver from '@forge/resolver';
import { kvs, WhereConditions  } from '@forge/kvs'; 
import { fetchAndCalculateAgents } from './agent-logic';

const resolver = new Resolver();


resolver.define('listAgents', async (req) => {
  const projectKey = process.env.PROJECT_KEY;
  const agents = await fetchAndCalculateAgents(projectKey);
  
  return agents.map(agent => ({
    ...agent, 
    estado: (agent.disponibilidadNum < 5) ? 'No Disponible' : 'Disponible',
    disponibilidad: `${Math.round(agent.disponibilidadNum)}%`,
  }));
});

// Función para obtener los roles y áreas guardados
resolver.define('getRolesAndAreas', async () => {
  console.log("Obteniendo roles y áreas desde KVS...");
  const config = await kvs.get('config'); 
  return {
    areas: config?.areas || []
  };
});

// Función para guardar los roles y áreas
resolver.define('saveRolesAndAreas', async (req) => {
  const { areas } = req.payload;
  const projectKey = process.env.PROJECT_KEY;
  console.log("Guardando áreas en KVS...");

  await kvs.set('config', { areas }); 
  
  const AREA_CUSTOM_FIELD_ID = process.env.AREA_FIELD_ID;

  try {
    console.log("Iniciando sincronización de áreas con Jira...");

    // 1. OBTENER EL ID NUMÉRICO DEL PROYECTO
    const projectResponse = await api.asApp().requestJira(route`/rest/api/3/project/${projectKey}`);
    const projectData = await projectResponse.json();
    const projectId = projectData.id;
    console.log(`ID numérico del proyecto "${projectKey}" es: ${projectId}`);

    // 2. OBTENER LOS CONTEXTOS DISPONIBLES PARA EL CAMPO PERSONALIZADO
    const contextResponse = await api.asApp().requestJira(route`/rest/api/3/field/${AREA_CUSTOM_FIELD_ID}/context`);
    const contextData = await contextResponse.json();

    // 3. ENCONTRAR EL CONTEXTO CORRECTO PARA NUESTRO PROYECTO
    let targetContextId = null;
    const globalContext = contextData.values.find(ctx => ctx.isGlobalContext);
    const projectContext = contextData.values.find(ctx => ctx.projectIds && ctx.projectIds.includes(projectId));

    if (projectContext) {
      targetContextId = projectContext.id;
      console.log(`Contexto específico de proyecto encontrado. ID: ${targetContextId}`);
    } else if (globalContext) {
      targetContextId = globalContext.id;
      console.log(`No se encontró contexto de proyecto, usando el contexto global. ID: ${targetContextId}`);
    }

    if (!targetContextId) {
      throw new Error("No se pudo encontrar un contexto aplicable para el campo personalizado en este proyecto.");
    }

    // 4. OBTENER LAS OPCIONES QUE YA EXISTEN EN ESE CONTEXTO
    const optionsResponse = await api.asApp().requestJira(route`/rest/api/3/field/${AREA_CUSTOM_FIELD_ID}/context/${targetContextId}/option`);
    const optionsData = await optionsResponse.json();
    const existingOptions = (optionsData.values || []).map(option => option.value);
    console.log("Opciones existentes en el contexto:", existingOptions);

    // 5. AÑADIR LAS NUEVAS OPCIONES AL CONTEXTO CORRECTO
    for (const area of areas) {
      if (!existingOptions.includes(area)) {
        console.log(`-> El área "${area}" no existe en el contexto ${targetContextId}. Añadiéndola...`);
        await api.asApp().requestJira(route`/rest/api/3/field/${AREA_CUSTOM_FIELD_ID}/context/${targetContextId}/option`, {
          method: 'POST',
          headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify({
            options: [{ value: area }] 
          })
        });
      }
    }
    console.log("Sincronización de áreas completada.");

  } catch (error) {
    console.error("Falló la sincronización de áreas con Jira:", error);
    if (error.response) { console.error(await error.response.text()); }
  }
  
  return { success: true };
});

resolver.define('saveAgentDetails', async (req) => {
  const { agentId, details } = req.payload;
  if (!agentId || !details) {
    throw new Error("Faltan datos para guardar los detalles del agente.");
  }

  const key = `agent-${agentId}`;
  await kvs.set(key, details); 

  console.log(`Detalles guardados para el agente ${agentId}`);
  return { success: true };
});


resolver.define('getAgentAssignedIssues', async (req) => {
  const { agentId, projectKey } = req.payload;

  if (!agentId || !projectKey) {
    throw new Error("Faltan el ID del agente o la clave del proyecto.");
  }

  try {
    const jql = `project = "${projectKey}" AND assignee = "${agentId}" AND resolution = Unresolved`;
    const fields = "summary,timeoriginalestimate"; 

    const response = await api.asApp().requestJira(route`/rest/api/3/search/jql?jql=${jql}&fields=${fields}`, {
        headers: {
            'Accept': 'application/json'
        }
    });
    if (!response.ok) {
      throw new Error(`Error en la API de JQL: ${response.status}`);
    }

    const data = await response.json();
    return data.issues.map(issue => ({
      key: issue.key,
      summary: issue.fields.summary,
      estimateSeconds: issue.fields.timeoriginalestimate || 0,
    }));

  } catch (error) {
    console.error(`Error al obtener las solicitudes para el agente ${agentId}:`, error);
    return []; 
  }
});



resolver.define('addNonWorkingDay', async (req) => {
  const { agentId, date } = req.payload;
  const key = `agent-${agentId}`;

  // 1. Obtenemos los datos actuales del agente
  const agentData = await kvs.get(key) || {};

  // 2. Añadimos la nueva fecha a la lista (si no existe ya)
  const nonWorkingDays = agentData.nonWorkingDays || [];
  if (!nonWorkingDays.includes(date)) {
    nonWorkingDays.push(date);
    nonWorkingDays.sort(); 
  }

  // 3. Guardamos el objeto actualizado
  await kvs.set(key, { ...agentData, nonWorkingDays });

  return { success: true, nonWorkingDays };
});

/**
 * Elimina un día inhábil para un agente específico.
 */
resolver.define('deleteNonWorkingDay', async (req) => {
  const { agentId, date } = req.payload;
  const key = `agent-${agentId}`;

  const agentData = await kvs.get(key) || {};
  
  // Filtramos la lista para eliminar la fecha especificada
  const nonWorkingDays = (agentData.nonWorkingDays || []).filter(d => d !== date);

  await kvs.set(key, { ...agentData, nonWorkingDays });

  return { success: true, nonWorkingDays };
});



export const handler = resolver.getDefinitions();