import { useState } from "react";
import { useNavigate } from "react-router-dom";
import SearchInput from "../components/ui/Button";

function SearchHome() {
  const [username, setUsername] = useState("");
  const navigate = useNavigate();

  const handleSearch = () => {
    if (username.trim()) {
      navigate(`/dashboard/${username}`);
      return;
    }
  };

  return (
    <main className="main-content">
      <div className="search-section">
        <SearchInput
          value={username}
          onChange={setUsername}
          onSearch={handleSearch}
        />
      </div>
    </main>
  );
}

export default SearchHome;
