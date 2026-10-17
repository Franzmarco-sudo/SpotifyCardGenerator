import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

// No <StrictMode>: the Fabric canvases are created in an effect and must not be double-mounted.
createRoot(document.getElementById('root')!).render(<App />)
