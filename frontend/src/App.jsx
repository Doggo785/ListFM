import './App.css';
import { useState } from 'react';
import SearchInput from './comopnents/ui/Button';

function TopBar() {
  return(
    <header className='top-bar'>
      <h1>ListFM</h1>
    </header>
  );
}

function MainContent() {
  const [username, setUsername] = useState('');

  const get_user_recent = async () => {
    if (!username) {
      console.error('Error fetching recent tracks: No username provided');
      return;
    }

    try{
      const response = await fetch(`http://localhost:8000/api/recent-tracks/${username}`);
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      else {
        const data = await response.json();
        console.log(data);
      }
    } catch (error) {
      console.error('Error fetching recent tracks:', error);
    }
    };
  return(
    <main className='main-content'>
      <div className="search-section">
        <SearchInput 
          value={username} 
          onChange={setUsername} 
          onSearch={get_user_recent} 
        />
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