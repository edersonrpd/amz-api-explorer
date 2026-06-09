import { X } from "lucide-react";
import { useEffect } from "react";
import { CopyButton } from "./CopyButton";

interface JsonModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: any;
  title?: string;
}

export function JsonModal({ isOpen, onClose, data, title = "JSON Bruto" }: JsonModalProps) {
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const jsonString = JSON.stringify(data, null, 2);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <div className="flex items-center gap-3">
            <CopyButton text={jsonString} label="Copiar JSON" />
            <button
              onClick={onClose}
              className="p-1 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-6 bg-gray-900">
          <pre className="text-xs text-green-400 font-mono whitespace-pre-wrap break-words">
            {jsonString}
          </pre>
        </div>
      </div>
    </div>
  );
}
