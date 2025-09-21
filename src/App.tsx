import React from 'react'
import { Card, CardHeader, CardTitle, CardContent } from './components/ui/Card'

export default function App(){
  return (
    <div className="min-h-screen p-6">
      <Card>
        <CardHeader><CardTitle>Church Attendance Dashboard</CardTitle></CardHeader>
        <CardContent>App code here (charts, filters, etc.)</CardContent>
      </Card>
    </div>
  )
}
