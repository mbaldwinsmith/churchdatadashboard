import React from 'react'
export function Checkbox({ checked, onChange }: { checked?: boolean, onChange?: (c: boolean)=>void }){
  return <input type="checkbox" className="checkbox" checked={!!checked} onChange={e=>onChange?.(e.target.checked)} />
}
