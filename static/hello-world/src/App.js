import React, { useEffect, useState, useMemo } from 'react';
import { invoke } from '@forge/bridge';
import './App.css';

// --- Iconos SVG para los botones ---
const FilterIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
  </svg>
);

const ExportIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
        <polyline points="7 10 12 15 17 10"></polyline>
        <line x1="12" y1="15" x2="12" y2="3"></line>
    </svg>
);

const InfoIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
);

const TrashIcon = () => ( <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg> );

const EditIcon = () => ( <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg> );


// --- Componente del Modal ---
const ConfigModal = ({ closeModal }) => {
  const [areas, setAreas] = useState([]);
  const [newArea, setNewArea] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // Cargar datos iniciales
  useEffect(() => {
    invoke('getRolesAndAreas').then(data => {
      setAreas(data.areas || []);
      setIsLoading(false);
    });
  }, []);

  const addArea = () => {
    if (newArea.trim() && !areas.includes(newArea.trim())) {
      setAreas([...areas, newArea.trim()]);
      setNewArea('');
    }
  };

  const deleteArea = (areaToDelete) => {
    setAreas(areas.filter(area => area !== areaToDelete));
  };

  const handleSave = () => {
    invoke('saveRolesAndAreas', { areas }).then(() => {
      closeModal();
    });
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h2>Gestionar áreas</h2>
          <button className="close-button" onClick={closeModal}>×</button>
        </div>
        <div className="modal-body">
          {isLoading ? <p>Cargando...</p> : (
            <div className="config-columns">
              {/* Columna de Áreas */}
              <div className="config-column">
                <h3>Áreas</h3>
                <div className="add-item-form">
                  <input type="text" value={newArea} onChange={e => setNewArea(e.target.value)} placeholder="Nueva área" />
                  <button onClick={addArea}>Agregar</button>
                </div>
                <ul className="item-list">
                  {areas.map(area => (
                    <li key={area}>
                      <span>{area}</span>
                      <button onClick={() => deleteArea(area)} className="delete-btn"><TrashIcon /></button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-save" onClick={handleSave}>Guardar cambios</button>
        </div>
      </div>
    </div>
  );
};


// --- Componente Modal de Edición de Agente ---
const EditAgentModal = ({ agent, availableAreas, closeModal, onSave }) => {
  const [area, setArea] = useState(agent.area === '-' ? '' : agent.area);
  
  const initialHorario = agent.horario.split(' - ');
  const [horaInicio, setHoraInicio] = useState(initialHorario[0] && initialHorario[0] !== '-' ? initialHorario[0] : '09:00');
  const [horaFin, setHoraFin] = useState(initialHorario[1] ? initialHorario[1] : '18:00');
  const [salarioPorHora, setSalarioPorHora] = useState(agent.salarioPorHora || '');
  const [nonWorkingDays, setNonWorkingDays] = useState(agent.nonWorkingDays || []);
  const [newDate, setNewDate] = useState('');

  const handleSave = () => {
    const horario = `${horaInicio} - ${horaFin}`;
    
    invoke('saveAgentDetails', { 
      agentId: agent.id, 
      details: { area, horario, salarioPorHora: Number(salarioPorHora) || 0, nonWorkingDays: nonWorkingDays } 
    }).then(() => {
      onSave(); 
      closeModal();
    });
  };


  const addDate = () => {
    if (newDate && !nonWorkingDays.includes(newDate)) {
      invoke('addNonWorkingDay', { agentId: agent.id, date: newDate }).then(result => {
        if (result.success) {
          setNonWorkingDays(result.nonWorkingDays);
          setNewDate(''); 
        }
      });
    }
  };

  const deleteDate = (dateToDelete) => {
    invoke('deleteNonWorkingDay', { agentId: agent.id, date: dateToDelete }).then(result => {
      if (result.success) {
        setNonWorkingDays(result.nonWorkingDays);
      }
    });
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h2>Editar agente: {agent.nombre}</h2>
          <button className="close-button" onClick={closeModal}>×</button>
        </div>
        <div className="modal-body">
          <div className="edit-form">
            <label>
              Área
              <select value={area} onChange={e => setArea(e.target.value)}>
                <option value="">Seleccionar área...</option>
                {availableAreas.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </label>
            {}
            <div className="horario-container">
              <label>
                Hora de inicio
                <input type="time" value={horaInicio} onChange={e => setHoraInicio(e.target.value)} />
              </label>
              <label>
                Hora de fin
                <input type="time" value={horaFin} onChange={e => setHoraFin(e.target.value)} />
              </label>
            </div>
            <div>
              <label>
                Salario por hora (MXN)
                <input 
                  type="number" 
                  value={salarioPorHora} 
                  onChange={e => setSalarioPorHora(e.target.value)} 
                  placeholder="Ej: 150.50" 
                />
              </label>
              <div className="non-working-days-section">
                <h4>Días inhábiles registrados</h4>
                <div className="add-item-form">
                  <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} />
                  <button onClick={addDate}>Agregar</button>
                </div>
                <ul className="item-list">
                  {nonWorkingDays.length > 0 ? (
                    nonWorkingDays.map(date => (
                      <li key={date}>
                        <span>{date}</span>
                        <button onClick={() => deleteDate(date)} className="delete-btn">×</button>
                      </li>
                    ))
                  ) : (
                    <li className="empty-list-message">No hay días inhábiles registrados.</li>
                  )}
                </ul>
              </div>
            </div>
            
            
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-save" onClick={handleSave}>Guardar cambios</button>
        </div>
      </div>
    </div>
  );
};


const FilterPopup = ({ availableAreas, initialFilters, onApply, closePopup }) => {
  const [area, setArea] = useState(initialFilters.area);
  const [estado, setEstado] = useState(initialFilters.estado);
  const [disponibilidad, setDisponibilidad] = useState(initialFilters.disponibilidad);
  const availableEstados = ['Disponible', 'No Disponible', 'En Pausa']; 

  const handleApply = () => {
    onApply({ area, estado, disponibilidad });
    closePopup();
  };

  return (
    <div className="filter-popup-overlay" onClick={closePopup}>
      <div className="filter-popup-content" onClick={e => e.stopPropagation()}>
        <h4>Filtrar por:</h4>
        <div className="filter-grid">
          {}
          <div className="filter-item">
            <label>Área</label>
            <select value={area} onChange={e => setArea(e.target.value)}>
              <option value="">Todas</option>
              {availableAreas.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          {}
          <div className="filter-item">
            <label>Estado</label>
            <select value={estado} onChange={e => setEstado(e.target.value)}>
              <option value="">Todos</option>
              {availableEstados.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>
          {}
          <div className="filter-item slider-item">
            <label>Disponibilidad mínima: <strong>{disponibilidad}%</strong></label>
            <input 
              type="range" 
              min="0" 
              max="100" 
              value={disponibilidad} 
              onChange={e => setDisponibilidad(Number(e.target.value))} 
            />
          </div>
        </div>
        <button className="btn btn-primary btn-accept" onClick={handleApply}>Aceptar</button>
      </div>
    </div>
  );
};


const AgentInfoModal = ({ agent, projectKey, closeModal }) => {
  const [issues, setIssues] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    invoke('getAgentAssignedIssues', { agentId: agent.id, projectKey })
      .then(assignedIssues => {
        setIssues(assignedIssues);
        setIsLoading(false);
      });
  }, [agent.id, projectKey]);

  return (
    <div className="modal-overlay">
      <div className="modal-content info-modal">
        <div className="modal-header">
          <h2>Información del agente</h2>
          <button className="close-button" onClick={closeModal}>×</button>
        </div>
        <div className="modal-body">
          <h3>Solicitudes asignadas:</h3>
          {isLoading ? (
            <p>Cargando solicitudes...</p>
          ) : (
            <ul className="issue-list">
              {issues.length > 0 ? (
                issues.map(issue => (
                  <li key={issue.key}>
                    <strong>{issue.key}:</strong> {issue.summary}
                  </li>
                ))
              ) : (
                <p>Este agente no tiene solicitudes asignadas actualmente.</p>
              )}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};


// --- FUNCIÓN para exportar a CSV ---
const exportToCSV = (agents) => {
  if (agents.length === 0) {
    alert("No hay datos para exportar.");
    return;
  }

  const headers = ['Nombre', 'Área', 'Horario', 'Estado', 'Disponibilidad'];
  
  const escapeCSV = (value) => {
    if (value === null || value === undefined) return '';
    const str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`; 
    }
    return str;
  };

  const rows = agents.map(agent => 
    [
      escapeCSV(agent.nombre),
      escapeCSV(agent.area),
      escapeCSV(agent.horario),
      escapeCSV(agent.estado),
      escapeCSV(agent.disponibilidad),
    ].join(',')
  );

  const csvContent = [headers.join(','), ...rows].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  
  const link = document.createElement("a");
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "disponibilidad_agentes.csv");
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
};





// --- Componente Principal de la App ---
export default function App() {
  const [allAgents, setAllAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Estados para los modales
  const [isConfigModalOpen, setConfigModalOpen] = useState(false);
  const [isEditModalOpen, setEditModalOpen] = useState(false);
  const [isFilterPopupOpen, setFilterPopupOpen] = useState(false);
  const [isInfoModalOpen, setInfoModalOpen] = useState(false);
  
  // Estado para los datos de configuración
  const [areas, setAreas] = useState([]);
  const [selectedAgent, setSelectedAgent] = useState(null);

  // Estado para los filtros activos
  const [filters, setFilters] = useState({
    area: '',
    estado: '',
    disponibilidad: 0,
  });

  const fetchAgents = () => {
    setLoading(true);
    invoke('listAgents', {}).then(fetchedAgents => {
      setAllAgents(fetchedAgents);
      setLoading(false);
    });
  };

  const fetchConfig = () => {
    invoke('getRolesAndAreas').then(data => {
      setAreas(data.areas || []);
    });
  };

  useEffect(() => {
    fetchAgents();
    fetchConfig();
  }, []);

  const openEditModal = (agent) => {
    setSelectedAgent(agent);
    setEditModalOpen(true);
  };

  const openInfoModal = (agent) => {
    setSelectedAgent(agent);
    setInfoModalOpen(true);
  };
  const projectKey = process.env.PROJECT_KEY;

  // Lógica para filtrar la lista de agentes
  const filteredAgents = useMemo(() => {
    return allAgents.filter(agent => {
      const disponibilidadValue = parseInt(agent.disponibilidad, 10);
      return (
        (filters.area ? agent.area === filters.area : true) &&
        (filters.estado ? agent.estado === filters.estado : true) &&
        (disponibilidadValue >= filters.disponibilidad)
      );
    });
  }, [allAgents, filters]);

  const handleExport = () => {
    exportToCSV(filteredAgents); 
  };

  // Función para formatear el dinero
  const formatCurrency = (value) => {
    const number = Number(value) || 0;
    return number.toLocaleString('es-MX', {
      style: 'currency',
      currency: 'MXN'
    });
  };
  
  return (
    <div className="agent-availability-container">
      {isConfigModalOpen && <ConfigModal closeModal={() => setConfigModalOpen(false)} />}
      {isEditModalOpen && (
        <EditAgentModal 
          agent={selectedAgent}
          availableAreas={areas}
          closeModal={() => setEditModalOpen(false)}
          onSave={fetchAgents} // Refresca la lista de agentes al guardar
        />
      )}
      {isFilterPopupOpen && (
        <FilterPopup
          availableAreas={areas}
          initialFilters={filters}
          onApply={setFilters}
          closePopup={() => setFilterPopupOpen(false)}
        />
      )}
      {isInfoModalOpen && <AgentInfoModal agent={selectedAgent} projectKey={projectKey} closeModal={() => setInfoModalOpen(false)} />}
      
      <div className="header-container">
        <h1 className="main-title">Disponibilidad de agentes</h1>
        <div className="actions-container">
          <button className="btn btn-secondary" onClick={() => setConfigModalOpen(true)}>Áreas</button>
          <button className="btn btn-filter" onClick={() => setFilterPopupOpen(true)}><FilterIcon /><span>Filtrar</span></button>
          <button className="btn btn-export" onClick={handleExport}><ExportIcon /><span>Exportar</span></button>
        </div>
      </div>

      <div className="content-area">
        <table className="agents-table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Área</th>
              <th>Horario</th>
              <th>Salario por hora</th>
              <th>Estado</th>
              <th>Disponibilidad</th>
              <th>Info.</th>
              <th>Editar</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="8" className="loading-message">Cargando agentes...</td></tr>
            ) : filteredAgents.length > 0 ? (
              filteredAgents.map(agent => (
                <tr key={agent.id}>
                  <td>{agent.nombre}</td>
                  <td>{agent.area}</td>
                  <td>{agent.horario}</td>
                  <td>{formatCurrency(agent.salarioPorHora)}</td>
                  <td>
                    <span className={`status-badge ${agent.estado === 'Disponible' ? 'available' : 'not-available'}`}>
                      {agent.estado}
                    </span>
                  </td>
                  <td>{agent.disponibilidad}</td>
                  <td>
                    <button className="btn-icon" onClick={() => openInfoModal(agent)}>
                      <InfoIcon />
                    </button>
                  </td>
                  <td>
                    <button className="btn-icon" onClick={() => openEditModal(agent)}>
                      <EditIcon />
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr><td colSpan="8" className="empty-table-message">No se encontraron agentes.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}