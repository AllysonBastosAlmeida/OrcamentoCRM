import { FileDown, FileSpreadsheet, FileText } from 'lucide-react';

const ExportButtons = ({ onPDF, onCSV, onExcel, compact = false, className = '', disabled = false }) => {
  const btnClass = compact ? 'btn-compact' : 'btn-secondary';
  const iconClass = compact ? 'h-3 w-3' : 'h-3.5 w-3.5 sm:h-4 sm:w-4';
  const labelClass = compact ? 'hidden sm:inline' : '';
  const disabledClass = disabled ? 'cursor-not-allowed opacity-60' : '';
  return (
    <div className={`flex flex-wrap gap-2 ${className}`.trim()}>
      {onPDF && (
        <button type="button" className={`${btnClass} ${disabledClass}`.trim()} onClick={onPDF} disabled={disabled}>
          <FileText className={iconClass} />
          <span className={labelClass}>PDF</span>
        </button>
      )}
      <button type="button" className={`${btnClass} ${disabledClass}`.trim()} onClick={onCSV} disabled={disabled}>
        <FileDown className={iconClass} />
        <span className={labelClass}>CSV</span>
      </button>
      <button type="button" className={`${btnClass} ${disabledClass}`.trim()} onClick={onExcel} disabled={disabled}>
        <FileSpreadsheet className={iconClass} />
        <span className={labelClass}>Excel</span>
      </button>
    </div>
  );
};

export default ExportButtons;
