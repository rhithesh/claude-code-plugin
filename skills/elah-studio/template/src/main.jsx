import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

// All three Elah stylesheets, in this order, then ours.
import '@elah/timeline/styles.css'
import '@elah/editor/styles.css'
import '@elah/editor/styles/tokens.css'
import './studio.css'

import Studio from './Studio'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Studio />
  </StrictMode>,
)
