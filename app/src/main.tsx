import '@fontsource/barlow/400.css'
import '@fontsource/barlow/500.css'
import '@fontsource/barlow/600.css'
import '@fontsource/barlow-condensed/700.css'
import '@fontsource/barlow-condensed/800.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { completeLoginFromUrl } from './github/auth'
import './index.css'
import { setSignedIn } from './store/store'
import { applyTheme } from './ui/theme'

applyTheme()

const root = createRoot(document.getElementById('root')!)
const render = (loginError?: string) =>
  root.render(
    <StrictMode>
      <App loginError={loginError} />
    </StrictMode>,
  )

completeLoginFromUrl()
  .then((returned) => {
    if (returned !== null) setSignedIn(true)
    render()
  })
  .catch((e: Error) => render(e.message))
