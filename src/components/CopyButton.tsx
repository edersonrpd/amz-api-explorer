import { Copy, Check } from "lucide-react";
import { useState } from "react";
import { cn } from "../lib/utils";

interface CopyButtonProps {
  text: string;
  className?: string;
  label?: string;
}

export function CopyButton({ text, className, label }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 px-2 py-1 text-xs font-medium transition-colors border rounded-md focus:outline-none focus:ring-2 focus:ring-amz-orange focus:ring-offset-1",
        copied
          ? "bg-green-50 text-green-700 border-green-200"
          : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50",
        className
      )}
      title="Copiar para a área de transferência"
    >
      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      {label && <span>{copied ? "Copiado!" : label}</span>}
    </button>
  );
}
