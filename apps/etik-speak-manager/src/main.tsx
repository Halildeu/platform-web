import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import EthicsManagerApp from '../../mfe-ethic/src/App';
import { AuthGate } from './AuthGate';
import { ManagerShell } from './ManagerShell';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('Etik Speak manager root elementi bulunamadı.');

createRoot(root).render(
  <StrictMode>
    <AuthGate>
      <ManagerShell>
        <EthicsManagerApp />
      </ManagerShell>
    </AuthGate>
  </StrictMode>,
);
