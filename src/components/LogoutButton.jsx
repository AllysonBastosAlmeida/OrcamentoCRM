import { LogOut } from 'lucide-react';

const LogoutButton = ({ onLogout }) => (
  <button className="btn-secondary" onClick={onLogout}>
    <LogOut className="h-4 w-4" />
    Sair
  </button>
);

export default LogoutButton;
