import { FileDown, FileSpreadsheet, FileText } from 'lucide-react';

const ExportButtons = ({ onPDF, onCSV, onExcel }) => {
  return (
    <div className="flex flex-wrap gap-2">
      <button className="btn-secondary" onClick={onPDF}>
        <FileText className="h-4 w-4" />
        PDF
      </button>
      <button className="btn-secondary" onClick={onCSV}>
        <FileDown className="h-4 w-4" />
        CSV
      </button>
      <button className="btn-secondary" onClick={onExcel}>
        <FileSpreadsheet className="h-4 w-4" />
        Excel
      </button>
    </div>
  );
};

export default ExportButtons;
