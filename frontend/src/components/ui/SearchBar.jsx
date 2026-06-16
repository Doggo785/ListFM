import styled from 'styled-components';

const SearchInput = ({value, onChange, onSearch}) => {
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      onSearch();
    }
  };
  return (
    <StyledWrapper>
      <div className="search-input-shell">
        <div id="poda">
          <div className="glow" />
          <div className="darkBorderBg" />
          <div className="darkBorderBg" />
          <div className="darkBorderBg" />
          <div className="white" />
          <div className="border" />
          <div id="main">
            <input 
              placeholder="Last.fm username..." 
              type="text" 
              name="text" 
              className="input" 
              value={value} 
              onChange={(e) => onChange(e.target.value)} 
              onKeyDown={handleKeyDown}
            />
            <div id="pink-mask" />
            <div id="search-icon">
              <svg xmlns="http://www.w3.org/2000/svg" width={24} viewBox="0 0 24 24" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" height={24} fill="none">
                <circle stroke="url(#search)" r={8} cy={11} cx={11} />
                <line stroke="url(#searchl)" y2="16.65" y1={22} x2="16.65" x1={22} />
                <defs>
                  <linearGradient gradientTransform="rotate(50)" id="search">
                    <stop stopColor="#ffffff" offset="0%" />
                    <stop stopColor="#737373" offset="50%" />
                  </linearGradient>
                  <linearGradient id="searchl">
                    <stop stopColor="#737373" offset="0%" />
                    <stop stopColor="#525252" offset="50%" />
                  </linearGradient>
                </defs>
              </svg>
            </div>
          </div>
        </div>
      </div>
    </StyledWrapper>
  );
}

const StyledWrapper = styled.div`
  .search-input-shell {
    position: relative;
    width: min(100%, 360px);
    height: 130px;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: visible;
  }

  .white,
  .border,
  .darkBorderBg,
  .glow {
    max-height: 70px;
    max-width: 314px;
    height: 100%;
    width: 100%;
    position: absolute;
    overflow: hidden;
    border-radius: 12px;
    filter: blur(3px);
    inset: 0;
    margin: auto;
    pointer-events: none;
    z-index: 0;
  }
  .input {
    background-color: #141414;
    border: 1px solid rgba(255, 255, 255, 0.06);
    width: 301px;
    height: 56px;
    border-radius: 10px;
    color: white;
    padding-inline: 59px;
    font-size: 18px;
    transition: border-color 0.3s ease;
  }
  #poda {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 314px;
    height: 70px;
    isolation: isolate;
  }
  .input::placeholder {
    color: #737373;
  }

  .input:focus {
    outline: none;
    border-color: rgba(255, 104, 23, 0.3);
  }

  .input:-webkit-autofill,
  .input:-webkit-autofill:hover,
  .input:-webkit-autofill:focus {
    -webkit-box-shadow: 0 0 0 1000px #141414 inset;
    -webkit-text-fill-color: #ffffff;
    caret-color: #ffffff;
    transition: background-color 5000s ease-in-out 0s;
  }

  #pink-mask {
    pointer-events: none;
    width: 30px;
    height: 20px;
    position: absolute;
    background: #FF6817;
    top: 10px;
    left: 5px;
    filter: blur(20px);
    opacity: 0.6;
    transition: all 2s;
  }
  #main:hover > #pink-mask {
    opacity: 0;
  }

  .white {
    max-height: 63px;
    max-width: 307px;
    border-radius: 10px;
    filter: blur(2px);
  }

  .white::before {
    content: "";
    z-index: -2;
    text-align: center;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%) rotate(83deg);
    position: absolute;
    width: 600px;
    height: 600px;
    background-repeat: no-repeat;
    background-position: 0 0;
    filter: brightness(1.4);
    background-image: conic-gradient(
      rgba(0, 0, 0, 0) 0%,
      rgba(255, 104, 23, 0.4),
      rgba(0, 0, 0, 0) 8%,
      rgba(0, 0, 0, 0) 50%,
      rgba(23, 174, 255, 0.4),
      rgba(0, 0, 0, 0) 58%
    );
    transition: all 2s;
  }
  .border {
    max-height: 59px;
    max-width: 303px;
    border-radius: 11px;
    filter: blur(0.5px);
  }
  .border::before {
    content: "";
    z-index: -2;
    text-align: center;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%) rotate(70deg);
    position: absolute;
    width: 600px;
    height: 600px;
    filter: brightness(1.3);
    background-repeat: no-repeat;
    background-position: 0 0;
    background-image: conic-gradient(
      #1c191c,
      #FF6817 5%,
      #1c191c 14%,
      #1c191c 50%,
      #17AEFF 60%,
      #1c191c 64%
    );
    transition: all 2s;
  }
  .darkBorderBg {
    max-height: 65px;
    max-width: 312px;
  }
  .darkBorderBg::before {
    content: "";
    z-index: -2;
    text-align: center;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%) rotate(82deg);
    position: absolute;
    width: 600px;
    height: 600px;
    background-repeat: no-repeat;
    background-position: 0 0;
    background-image: conic-gradient(
      rgba(0, 0, 0, 0),
      #FF5900,
      rgba(0, 0, 0, 0) 10%,
      rgba(0, 0, 0, 0) 50%,
      #17AEFF,
      rgba(0, 0, 0, 0) 60%
    );
    transition: all 2s;
  }
  #poda:hover > .darkBorderBg::before {
    transform: translate(-50%, -50%) rotate(-98deg);
  }
  #poda:hover > .glow::before {
    transform: translate(-50%, -50%) rotate(-120deg);
  }
  #poda:hover > .white::before {
    transform: translate(-50%, -50%) rotate(-97deg);
  }
  #poda:hover > .border::before {
    transform: translate(-50%, -50%) rotate(-110deg);
  }

  #poda:focus-within > .darkBorderBg::before {
    transform: translate(-50%, -50%) rotate(442deg);
    transition: all 4s;
  }
  #poda:focus-within > .glow::before {
    transform: translate(-50%, -50%) rotate(420deg);
    transition: all 4s;
  }
  #poda:focus-within > .white::before {
    transform: translate(-50%, -50%) rotate(443deg);
    transition: all 4s;
  }
  #poda:focus-within > .border::before {
    transform: translate(-50%, -50%) rotate(430deg);
    transition: all 4s;
  }

  .glow {
    overflow: hidden;
    filter: blur(30px);
    opacity: 0.4;
    max-height: 130px;
    max-width: 354px;
    z-index: -1;
  }
  .glow:before {
    content: "";
    z-index: -2;
    text-align: center;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%) rotate(60deg);
    position: absolute;
    width: 999px;
    height: 999px;
    background-repeat: no-repeat;
    background-position: 0 0;
    background-image: conic-gradient(
      #000,
      #FF6817 5%,
      #000 38%,
      #000 50%,
      #17AEFF 60%,
      #000 87%
    );
    transition: all 2s;
  }

  #main {
    position: relative;
    z-index: 2;
  }
  #search-icon {
    position: absolute;
    left: 20px;
    top: 15px;
  }`;

export default SearchInput;
