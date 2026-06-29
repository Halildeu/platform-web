import { createRoot } from 'react-dom/client';
import MeetingApp from './App';

const container = document.getElementById('root');

if (!container) {
  throw new Error('[mfe-meeting] root elementi bulunamadı.');
}

createRoot(container).render(<MeetingApp />);
