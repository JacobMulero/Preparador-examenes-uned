import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { questionsApi, progressApi } from '../shared/api';
import ProgressBar from '../progress/ProgressBar';
import StatsPanel from '../progress/StatsPanel';
import './TopicSelector.css';

// Topic metadata with descriptions
const topicDescriptions = {
  'Tema1': 'Query Processing - Cost estimation, selection algorithms, sorting, join algorithms',
  'Tema2': 'Query Optimization - Catalog statistics, equivalence rules, cost-based optimization',
  'Tema3': 'Transactions - ACID properties, serializability, schedules',
  'Tema4': 'Concurrency Control - Locking protocols, two-phase locking, deadlock handling',
  'Tema5': 'Recovery System - Log-based recovery, ARIES, checkpoints',
  'Tema6': 'Additional Topics',
  'Tema7': 'Additional Topics',
  'SinTema': 'Mixed Questions - Various topics',
};

function TopicSelector() {
  const [topics, setTopics] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setError(null);

    try {
      const [topicsRes, statsRes] = await Promise.all([
        questionsApi.getTopics(),
        progressApi.getStats(),
      ]);

      // API layer already transforms the data
      setTopics(topicsRes.data || []);
      setStats(statsRes.data || null);
    } catch (err) {
      console.error('Error loading data:', err);
      setError('Error al cargar los datos. Asegurate de que el servidor esta ejecutandose.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="topic-selector">
        <h1 className="page-title">Selecciona un Tema</h1>
        <div className="topics-grid">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="topic-card skeleton-card">
              <div className="skeleton skeleton-text" style={{ width: '40%' }}></div>
              <div className="skeleton skeleton-text" style={{ width: '80%' }}></div>
              <div className="skeleton skeleton-text" style={{ width: '60%' }}></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="topic-selector">
        <h1 className="page-title">Selecciona un Tema</h1>
        <div className="alert alert-error">
          {error}
        </div>
        <button className="btn btn-primary" onClick={loadData}>
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="topic-selector">
      <div className="topic-header">
        <h1 className="page-title">Selecciona un Tema</h1>
        <p className="page-subtitle">
          Practica con preguntas de examen de Bases de Datos Avanzadas
        </p>
      </div>

      {stats && <StatsPanel stats={stats} compact />}

      <div className="topics-grid">
        {topics.map((topic) => {
          const description = topicDescriptions[topic.id] || topic.name;

          return (
            <Link
              key={topic.id}
              to={`/topic/${topic.id}`}
              className="topic-card"
            >
              <div className="topic-card-header">
                <span className="topic-number">
                  {topic.id.replace('Tema', 'T').replace('SinTema', 'Mix')}
                </span>
                <span className="topic-count">{topic.questionCount} preguntas</span>
              </div>

              <h3 className="topic-name">{topic.name}</h3>
              <p className="topic-description">{description}</p>

              {topic.questionCount > 0 && (
                <div className="topic-stats">
                  <ProgressBar value={0} />
                </div>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export default TopicSelector;
