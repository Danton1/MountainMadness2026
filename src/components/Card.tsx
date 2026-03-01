import React from 'react'

interface CardProps {
    children: React.ReactNode;
    className?: string;
}

const Card: React.FC<CardProps> = ({ children, className = "" }) => {
    return <div className="bg-white rounded-2xl shadow-lg border border-emerald-100 p-6 ${className}">{children}</div>;
}


interface CardTitleProps {
    children: React.ReactNode;
}

const CardTitle: React.FC<CardTitleProps> = ({ children }) => {
    return <h2 className="text-lg font-semibold text-emerald-700 mb-4">{children}</h2>;
}

export { Card, CardTitle }