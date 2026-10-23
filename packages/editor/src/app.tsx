import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { EditorPage } from './pages/EditorPage';
import { RoomListPage } from './pages/RoomListPage';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RoomListPage />} />
        <Route path="/r/:roomId" element={<EditorPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
