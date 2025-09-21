import React from 'react'
export function Card({ className='', children }: React.PropsWithChildren<{className?:string}>) {
  return <div className={`card ${className}`}>{children}</div>
}
export function CardHeader({ children }: React.PropsWithChildren) {
  return <div className="card-header">{children}</div>
}
export function CardTitle({ children }: React.PropsWithChildren) {
  return <div className="card-title">{children}</div>
}
export function CardContent({ children, className='' }: React.PropsWithChildren<{className?:string}>) {
  return <div className={className}>{children}</div>
}
