import api, { route } from "@forge/api";
import { kvs, WhereConditions   } from '@forge/kvs';

// Función auxiliar para calcular horas 
const calculateWeeklyHours = (horarioString, nonWorkingDays = []) => {
  let dailyHours = 8;
  if (horarioString && horarioString.includes(' - ')) {
      try {
          const [inicio, fin] = horarioString.split(' - ');
          const [horaInicio] = inicio.split(':').map(Number);
          const [horaFin] = fin.split(':').map(Number);
          const duration = horaFin - horaInicio;
          if (duration > 0) dailyHours = duration;
      } catch (e) {  }
  }

  const today = new Date();
  const dayOfWeek = today.getDay(); 

  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1));
  
  let workingDaysThisWeek = 0;
  for (let i = 0; i < 5; i++) {
      const currentDate = new Date(startOfWeek);
      currentDate.setDate(startOfWeek.getDate() + i);
      
      const dateString = currentDate.toISOString().split('T')[0]; 

      if (!nonWorkingDays.includes(dateString)) {
          workingDaysThisWeek++;
      }
  }

  return dailyHours * workingDaysThisWeek;
};

// Esta es la función principal que ahora puede ser usada en cualquier parte
export const fetchAndCalculateAgents = async (projectKey) => {
  try {
    const userResponse = await api.asApp().requestJira(route`/rest/api/3/users/search?query=&maxResults=100`);
    const users = await userResponse.json();
    const activeUsers = users.filter(user => user.accountType === 'atlassian' && user.active);

    const agentDataQuery = await kvs.query().where('key', WhereConditions.beginsWith('agent-')).getMany();
    const savedAgentsData = agentDataQuery.results.reduce((acc, item) => {
      acc[item.key] = item.value; return acc;
    }, {});

    const jql = `project = "${projectKey}" AND resolution = Unresolved`;
    const fields = "summary,assignee,timeoriginalestimate";
    const response = await api.asApp().requestJira(route`/rest/api/3/search/jql?jql=${jql}&fields=${fields}`, {
        headers: {
            'Accept': 'application/json'
        }
    });
    
    if (!response.ok) {
        throw new Error(`Error en la API de JQL: ${response.status}`);
    }
    
    const allIssuesData = await response.json();
    const allIssues = allIssuesData.issues || [];

    const agents = activeUsers.map(user => {
      const savedData = savedAgentsData[`agent-${user.accountId}`];
      const capacidadSemanalHoras = calculateWeeklyHours(savedData?.horario, savedData?.nonWorkingDays);
      const agentIssues = allIssues.filter(issue => issue.fields.assignee && issue.fields.assignee.accountId === user.accountId);
      let cargaTotalSegundos = 0;
      agentIssues.forEach(issue => { cargaTotalSegundos += issue.fields.timeoriginalestimate || 0; });
      const cargaTotalHoras = cargaTotalSegundos / 3600;
      let disponibilidadNum = 100;
      if (capacidadSemanalHoras > 0) {
        disponibilidadNum = 100 - ((cargaTotalHoras / capacidadSemanalHoras) * 100);
      }
      disponibilidadNum = Math.max(0, disponibilidadNum);


      return {
        id: user.accountId,
        nombre: user.displayName,
        disponibilidadNum: disponibilidadNum,
        area: savedData?.area || '-', 
        horario: savedData?.horario || '-', 
        salarioPorHora: savedData?.salarioPorHora || 0,
        nonWorkingDays: savedData?.nonWorkingDays || [],
        capacidadSemanalHoras: capacidadSemanalHoras,
        cargaTotalHoras: cargaTotalHoras,
      };
    });
    return agents.sort((a, b) => b.disponibilidadNum - a.disponibilidadNum);
  } catch (error) {
    console.error("Error al obtener y calcular agentes:", error);
    if (error.response) { console.error("Detalles:", await error.response.text()); }
    return [];
  }
};