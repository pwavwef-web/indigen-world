import { Route, Routes } from 'react-router-dom';
import Layout from './Layout';
import Home from './pages/Home';
import Impact from './pages/Impact';
import Partners from './pages/Partners';
import ProjectKasena from './pages/ProjectKasena';
import Stories from './pages/Stories';

function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="project-kasena" element={<ProjectKasena />} />
        <Route path="stories" element={<Stories />} />
        <Route path="impact" element={<Impact />} />
        <Route path="partners" element={<Partners />} />
        <Route path="*" element={<Home />} />
      </Route>
    </Routes>
  );
}

export default App;
