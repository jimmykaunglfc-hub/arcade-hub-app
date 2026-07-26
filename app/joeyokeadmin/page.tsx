"use client";

import { 
  Users, 
  Coins, 
  Gamepad2, 
  Gift, 
  Download, 
  FileText, 
  Server, 
  Database, 
  CreditCard,
  PlusCircle,
  CheckCircle2,
  AlertTriangle
} from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

// Mock Data for the Line Chart based on the prototype's curve
const chartData = [
  { name: 'Mon', revenue: 4000 },
  { name: 'Tue', revenue: 3000 },
  { name: 'Wed', revenue: 2000 },
  { name: 'Thu', revenue: 2780 },
  { name: 'Fri', revenue: 1890 },
  { name: 'Sat', revenue: 2390 },
  { name: 'Sun', revenue: 3490 },
];

export default function DashboardOverview() {
  return (
    <div className="space-y-8 animate-fade-in">
      
      {/* HEADER & EXPORT ACTIONS */}
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-1">Admin / Dashboard Overview</p>
          <h2 className="font-headline text-3xl font-black text-white tracking-tight">Dashboard Overview</h2>
          <p className="font-body text-xs text-neutral-400 mt-2">Welcome back. Here's what's happening with Joe Yoke today.</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 bg-white/5 border border-white/10 px-4 py-2.5 rounded-xl text-xs font-bold text-white hover:bg-white/10 transition-colors">
            <Download className="w-4 h-4 text-neutral-400" /> Export
          </button>
          <button className="flex items-center gap-2 bg-[#B259FF] px-5 py-2.5 rounded-xl text-xs font-black text-white hover:bg-[#a045f0] transition-colors shadow-[0_0_15px_rgba(178,89,255,0.3)]">
            <FileText className="w-4 h-4" /> Generate Report
          </button>
        </div>
      </header>

      {/* KPI METRIC CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { label: "Total Active Users", value: "124,592", trend: "+12.5%", isPositive: true, icon: Users, color: "text-indigo-400", bg: "bg-indigo-500/10" },
          { label: "Total Revenue", value: "$84,239.00", trend: "+8.2%", isPositive: true, icon: Coins, color: "text-amber-400", bg: "bg-amber-500/10" },
          { label: "Games Played Today", value: "45,912", trend: "-2.4%", isPositive: false, icon: Gamepad2, color: "text-rose-400", bg: "bg-rose-500/10" },
          { label: "Pending Redemptions", value: "1,204", trend: "+18.1%", isPositive: true, icon: Gift, color: "text-[#B259FF]", bg: "bg-[#B259FF]/10" }
        ].map((stat, idx) => (
          <div key={idx} className="bg-[#18181b] border border-white/10 rounded-[24px] p-6 shadow-xl relative overflow-hidden group hover:border-white/20 transition-all">
            <div className="flex justify-between items-start mb-4">
              <p className="font-headline text-[11px] font-bold text-neutral-400 uppercase tracking-wider">{stat.label}</p>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${stat.bg} ${stat.color}`}>
                <stat.icon className="w-5 h-5" />
              </div>
            </div>
            <h3 className="font-headline text-3xl font-black text-white tracking-tight">{stat.value}</h3>
            <p className={`text-[10px] font-bold mt-3 flex items-center gap-1.5 uppercase tracking-wider ${stat.isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
              {stat.isPositive ? '↗' : '↘'} {stat.trend} <span className="text-neutral-500 ml-1">vs last period</span>
            </p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* REVENUE & USER GROWTH CHART */}
        <div className="lg:col-span-2 bg-[#18181b] border border-white/10 rounded-[24px] p-6 shadow-xl">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h3 className="font-headline text-lg font-black text-white tracking-wide">Revenue & User Growth</h3>
              <p className="text-xs text-neutral-400 mt-1">Performance over the last 7 days</p>
            </div>
            <select className="bg-white/5 border border-white/10 text-xs font-bold text-white px-4 py-2 rounded-lg focus:outline-none focus:border-[#CCFF00]">
              <option className="bg-[#18181b]">Last 7 days</option>
              <option className="bg-[#18181b]">Last 30 days</option>
              <option className="bg-[#18181b]">All time</option>
            </select>
          </div>
          
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                <XAxis dataKey="name" stroke="#6b7280" fontSize={10} tickLine={false} axisLine={false} dy={10} />
                <YAxis stroke="#6b7280" fontSize={10} tickLine={false} axisLine={false} dx={-10} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#09090b', borderColor: '#ffffff20', borderRadius: '12px', fontSize: '12px', fontWeight: 'bold' }}
                  itemStyle={{ color: '#B259FF' }}
                />
                <Line 
                  type="monotone" 
                  dataKey="revenue" 
                  stroke="#B259FF" 
                  strokeWidth={4}
                  dot={{ r: 4, fill: "#09090b", stroke: "#B259FF", strokeWidth: 2 }}
                  activeDot={{ r: 6, fill: "#B259FF", stroke: "#09090b" }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* SYSTEM HEALTH & QUICK ACTIONS */}
        <div className="space-y-6">
          
          {/* System Health */}
          <div className="bg-[#18181b] border border-white/10 rounded-[24px] p-6 shadow-xl">
            <h3 className="font-headline text-lg font-black text-white tracking-wide mb-5">System Health</h3>
            <div className="space-y-3">
              
              <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Server className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-bold text-white">API Servers</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black text-emerald-400 uppercase">99.9%</span>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                </div>
              </div>

              <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Database className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-bold text-white">Database</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black text-emerald-400 uppercase">99.9%</span>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                </div>
              </div>

              <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CreditCard className="w-4 h-4 text-amber-400" />
                  <span className="text-xs font-bold text-white">Payment Gateway</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black text-amber-400 uppercase">Degraded</span>
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                </div>
              </div>

            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-[#18181b] border border-white/10 rounded-[24px] p-6 shadow-xl">
            <h3 className="font-headline text-lg font-black text-white tracking-wide mb-4">Quick Actions</h3>
            <div className="grid grid-cols-2 gap-4">
              <button className="bg-white/5 hover:bg-[#CCFF00]/10 border border-transparent hover:border-[#CCFF00]/20 rounded-xl p-4 flex flex-col items-center justify-center gap-3 transition-colors group">
                <div className="w-10 h-10 rounded-full bg-white/5 group-hover:bg-[#CCFF00]/20 flex items-center justify-center transition-colors">
                  <PlusCircle className="w-5 h-5 text-neutral-400 group-hover:text-[#CCFF00] transition-colors" />
                </div>
                <span className="text-[10px] font-bold text-white uppercase tracking-wider">New Game</span>
              </button>
              
              <button className="bg-white/5 hover:bg-[#B259FF]/10 border border-transparent hover:border-[#B259FF]/20 rounded-xl p-4 flex flex-col items-center justify-center gap-3 transition-colors group">
                <div className="w-10 h-10 rounded-full bg-white/5 group-hover:bg-[#B259FF]/20 flex items-center justify-center transition-colors">
                  <Gift className="w-5 h-5 text-neutral-400 group-hover:text-[#B259FF] transition-colors" />
                </div>
                <span className="text-[10px] font-bold text-white uppercase tracking-wider text-center leading-tight">Review Redeem</span>
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}