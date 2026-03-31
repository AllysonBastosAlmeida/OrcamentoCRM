import { LogOut } from 'lucide-react';

const LogoutButton = ({ onLogout, className = 'btn-secondary', labelClassName = '' }) => (
  <button className={className} onClick={onLogout}>
    <LogOut className="h-4 w-4" />
    <span className={labelClassName}>Sair</span>
  </button>
);

export default LogoutButton;
