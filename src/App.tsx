import { Routes, Route, Navigate } from 'react-router-dom';
import OverviewPage from './pages/OverviewPage';
import StarChartsPage from './pages/StarChartsPage';
import './App.css';

function App() {
  return (
    <Routes>
      <Route path="/" element={<OverviewPage />} />
      <Route path="/starcharts" element={<StarChartsPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
