import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// StrictMode is off: react-leaflet 4.x's MapContainer does not tolerate
// React 18's dev-mode double-mount (it throws "Cannot read properties of
// undefined (reading '0')" and unmounts the whole tree on a cold load).
ReactDOM.createRoot(document.getElementById('root')).render(
  <App />,
)
