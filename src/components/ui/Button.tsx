import React from 'react'
type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'default'|'outline'|'ghost'|'secondary', size?: 'sm'|'md' }
export function Button({ className='', variant='default', size='md', ...props }: Props){
  const v = variant==='default' ? 'btn-primary' : variant==='outline' ? 'btn btn-outline' : variant==='ghost' ? 'btn btn-ghost' : 'btn'
  const s = size==='sm' ? 'text-sm' : ''
  return <button className={`btn ${v} ${s} ${className}`} {...props} />
}
