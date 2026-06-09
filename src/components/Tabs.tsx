import { ReactNode } from "react";
import { cn } from "../lib/utils";

interface TabsProps {
  tabs: string[];
  activeTab: string;
  onChange: (tab: string) => void;
}

export function Tabs({ tabs, activeTab, onChange }: TabsProps) {
  return (
    <div className="flex space-x-1 border-b border-gray-200">
      {tabs.map((tab) => (
        <button
          key={tab}
          onClick={() => onChange(tab)}
          className={cn(
            "px-4 py-3 text-sm font-medium transition-colors border-b-2",
            activeTab === tab
              ? "border-amz-orange text-amz-orange"
              : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
          )}
        >
          {tab}
        </button>
      ))}
    </div>
  );
}
