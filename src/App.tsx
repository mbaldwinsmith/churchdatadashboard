import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/Card'
import { Button } from './components/ui/Button'
import { Input } from './components/ui/Input'
import { Label } from './components/ui/Label'
import { Checkbox } from './components/ui/Checkbox'
import Papa from 'papaparse'
import { Download, RefreshCcw, Filter, CalendarDays } from 'lucide-react'
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Legend,
  Line, LineChart, Pie, PieChart, ResponsiveContainer, Scatter, ScatterChart,
  Tooltip, XAxis, YAxis
} from 'recharts'

function mulberry32(a:number){return function(){let t=(a+=0x6D2B79F5);t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296}}
function easterSunday(year:number){const a=year%19;const b=Math.floor(year/100);const c=year%100;const d=Math.floor(b/4);const e=b%4;const f=Math.floor((b+8)/25);const g=Math.floor((b-f+1)/3);const h=(19*a+b-d-g+15)%30;const i=Math.floor(c/4);const k=c%4;const l=(32+2*e+2*i-h-k)%7;const m=Math.floor((a+11*h+22*l)/451);const month=Math.floor((h+l-7*m+114)/31);const day=1+((h+l-7*m+114)%31);return new Date(year,month-1,day);}
function firstSundayOfYear(year:number){const d=new Date(year,0,1);const w=d.getDay();const offset=(7-w)%7;return new Date(year,0,1+offset);}
function monthName(n:number){return ['January','February','March','April','May','June','July','August','September','October','November','December'][n]}
function clamp(x:number,min:number,max:number){return Math.max(min,Math.min(max,x))}

type Row = { Week:number, Date:string, Year:number, Month:string, Site:string, Service:string, Attendance:number, Kids:number }

function generateRowsForYear(year:number, seed=42): Row[] {
  const rng = mulberry32(seed + year);
  const sundays = Array.from({length:52},(_,w)=>{const d=firstSundayOfYear(year);d.setDate(d.getDate()+w*7);return d;});
  const easter = easterSunday(year);
  const christmasSunday = sundays.find(s=>new Date(year,11,20)<=s&&s<=new Date(year,11,27));
  const configs = [
    { site: 'Central', service: '9am',  attAvg: 200, kidsAvg: 60, clampKids: null as null | [number,number] },
    { site: 'Central', service: '11am', attAvg: 180, kidsAvg: 40, clampKids: null as null | [number,number] },
    { site: 'Central', service: '6pm',  attAvg: 50,  kidsAvg: 5,  clampKids: [2,8] as [number,number] },
    { site: 'West',    service: '10am', attAvg: 60,  kidsAvg: 10, clampKids: null as null | [number,number] },
  ]
  const attAnnual = 0.13, kidsAnnual = 0.20
  const rows: Row[] = []
  for(let w=0; w<52; w++){
    const sunday = sundays[w]
    const t = w/51
    const attGrowth = Math.pow(1+attAnnual, t)
    const kidsGrowth = Math.pow(1+kidsAnnual, t)
    let attSeason = 1.0, kidsSeason = 1.0
    if(sunday.getMonth()===6 || sunday.getMonth()===7){ attSeason*=0.80; kidsSeason*=0.80 }
    const sameDay = (a:Date,b:Date)=>a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate()
    if(sameDay(sunday,easter)){ attSeason*=1.80; kidsSeason*=1.60 }
    if(christmasSunday && sameDay(sunday, christmasSunday)){ attSeason*=1.90; kidsSeason*=1.70 }

    for(const conf of configs){
      const noise = clamp((rng()*0.3)+0.85, 0.7, 1.3)
      const att = Math.round(conf.attAvg * attGrowth * attSeason * noise)
      const noiseK = clamp((rng()*0.3)+0.85, 0.7, 1.3)
      let kids = conf.kidsAvg * kidsGrowth * kidsSeason * noiseK
      const isPeak = (sameDay(sunday, easter) || (christmasSunday && sameDay(sunday, christmasSunday)))
      if(conf.clampKids && !isPeak){ kids = clamp(kids, conf.clampKids[0], conf.clampKids[1]) }
      kids = Math.round(kids)
      rows.push({ Week:w+1, Date: sunday.toISOString().slice(0,10), Year: sunday.getFullYear(), Month: monthName(sunday.getMonth()), Site: conf.site, Service: conf.service, Attendance: att, Kids: kids })
    }
  }
  return rows
}

function useCSVData(){
  const [rows, setRows] = useState<Row[]>([])
  const [error, setError] = useState<string>('')
  const parse = (csvText: string) => {
    setError('')
    Papa.parse(csvText, {
      header: true, skipEmptyLines: true, transformHeader: (h)=>h.trim(),
      complete: (res) => {
        // @ts-ignore
        const normalized: Row[] = res.data.map((r: any) => ({
          Week: Number(r['Week'])||0,
          Date: r['Date'],
          Year: r['Year'] ? Number(r['Year']) : (r['Date'] ? new Date(r['Date']).getFullYear() : null),
          Month: r['Month'],
          Site: r['Site'] || 'Central',
          Service: r['Service'],
          Attendance: Number(r['Attendance'])||0,
          Kids: Number(r['Kids Checked-in']) || Number(r['Kids Checked-In']) || 0,
        })).filter((r: Row)=>r.Date && r.Service)
        setRows(normalized)
      },
      error: (err) => setError(String(err)),
    })
  }
  const loadGenerated = (years: number | number[]) => {
    const list = Array.isArray(years) ? years : [years]
    const merged = list.flatMap(y => generateRowsForYear(y))
    setRows(merged)
  }
  useEffect(()=>{ loadGenerated(2025) },[])
  return { rows, setRows, error, parse, loadGenerated }
}

function summarize(rows: Row[]){
  let totalAtt=0,totalKids=0; let peak={date:null as string|null, service:null as string|null, value:-Infinity}
  for(const r of rows){ totalAtt+=r.Attendance; totalKids+=r.Kids; if(r.Attendance>peak.value) peak={date:r.Date,service:r.Service,value:r.Attendance} }
  return { records: rows.length, totalAtt, totalKids, peak }
}
function monthOrder(name:string){const months=['January','February','March','April','May','June','July','August','September','October','November','December'];return months.indexOf(name)}

export default function App(){
  const { rows, parse, error, loadGenerated } = useCSVData()
  const summary = useMemo(()=>summarize(rows),[rows])

  return (
    <div className="min-h-screen p-6 space-y-6">
      <Card>
        <CardHeader><CardTitle>Church Attendance Dashboard</CardTitle></CardHeader>
        <CardContent>
          Records: {summary.records}, Attendance: {summary.totalAtt}, Kids: {summary.totalKids}
        </CardContent>
      </Card>
    </div>
  )
}
