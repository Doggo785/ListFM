import './App.css';

function TopBar() {
  return(
    <header className='top-bar'>
      <h1>My App</h1>
    </header>
  );
} 

function MainContent() {
  return(
    <main className='main-content'>
<h2>On prépare ta prochaine playlist !</h2>
      <div className="dashboard-placeholder">
        <p>Zone de travail en construction...</p>
      </div>
    </main>
  );
}

function App() {
  return (
    <div className='app-container'>
      <TopBar />
      <MainContent />
    </div>
  );
}

export default App;