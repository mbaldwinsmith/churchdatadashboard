import React from 'react'
export function Label({ children, className='' }: React.PropsWithChildren<{className?:string}>){
  return <label className={`label ${className}`}>{children}</label>
}
