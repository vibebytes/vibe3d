import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { EditorPage } from './pages/EditorPage';
import { RoomListPage } from './pages/RoomListPage';
import { SurfaceBridge } from './viewport/SurfaceBridge';

export function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <SurfaceBridge />
      <Routes>
        <Route path="/" element={<RoomListPage />} />
        <Route path="/r/:roomId" element={<EditorPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
