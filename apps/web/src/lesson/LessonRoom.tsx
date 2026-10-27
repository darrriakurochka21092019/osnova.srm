import { Route, Routes } from 'react-router-dom';
import { LessonLobby } from './LessonEntry';
import LessonWorkspace from './LessonWorkspace';
import { AccessExpired } from './shared';
export default function LessonRouter() {
  return (
    <Routes>
      <Route path="/lesson/:id" element={<LessonLobby />} />
      <Route path="/lesson/:id/prepare" element={<LessonWorkspace mode="prepare" />} />
      <Route path="/lesson/:id/live/:sessionId" element={<LessonWorkspace />} />
      <Route
        path="/lesson/:id/materials/:sessionId"
        element={<LessonWorkspace mode="materials" />}
      />
      <Route path="*" element={<AccessExpired />} />
    </Routes>
  );
}
