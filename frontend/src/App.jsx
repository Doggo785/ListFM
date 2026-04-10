import { Routes, Route } from "react-router-dom";
import "./App.css";
import SearchHome from "./views/SearchHome";
import Dashboard from "./views/Dashboard";

function TopBar() {
  return (
    <header className="top-bar">
      <h1>ListFM</h1>
    </header>
  );
}

function App() {
  return (
    <div className="app-container">
      <TopBar />
      <div className="app-main">
        <Routes>
          <Route path="/" element={<SearchHome />} />
          <Route path="/dashboard/:username" element={<Dashboard />} />
        </Routes>
      </div>
    </div>
  );
}

export default App;
