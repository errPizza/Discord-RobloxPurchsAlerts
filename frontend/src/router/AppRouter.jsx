import { BrowserRouter, Route, Routes } from "react-router-dom";
import Home from "../pages/Home.jsx";
import Login from "../pages/Login.jsx";
import Dashboard from "../pages/Dashboard.jsx";
import Stats from "../pages/Stats.jsx";
import Database from "../pages/Database.jsx";
import WorkerControl from "../pages/WorkerControl.jsx";
import NotFound from "../pages/NotFound.jsx";
import DashboardLayout from "../layouts/DashboardLayout.jsx";
export default function AppRouter() { return <BrowserRouter><Routes><Route path="/" element={<Home />} /><Route path="/login" element={<Login />} /><Route path="/dashboard" element={<DashboardLayout />}><Route index element={<Dashboard />} /><Route path="stats" element={<Stats />} /><Route path="worker" element={<WorkerControl />} /><Route path="database" element={<Database />} /></Route><Route path="*" element={<NotFound />} /></Routes></BrowserRouter>; }
