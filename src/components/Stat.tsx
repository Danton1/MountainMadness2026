import React from 'react'
  
  function Stat({ label, value }: { label: string; value: number }) {
    return (
      <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4">
        <div className="text-2xl font-bold text-emerald-700">{value}</div>
        <div className="text-xs text-gray-600 mt-1">{label}</div>
      </div>
    );
  }
  
  export default Stat