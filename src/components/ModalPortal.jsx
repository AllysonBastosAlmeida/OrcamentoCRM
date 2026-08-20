import { createPortal } from 'react-dom';

const ModalPortal = ({ children }) => {
  if (typeof document === 'undefined') {
    return null;
  }

  return createPortal(children, document.body);
};

export default ModalPortal;
