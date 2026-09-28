import type { ReactNode } from 'react'
import type { BrowserId } from '@shared/types'
import chromeLogo from '../assets/browsers/chrome.svg'
import edgeLogo from '../assets/browsers/edge.svg'
import braveLogo from '../assets/browsers/brave.svg'
import operaLogo from '../assets/browsers/opera.svg'
import vivaldiLogo from '../assets/browsers/vivaldi.svg'
import firefoxLogo from '../assets/browsers/firefox.svg'

/**
 * Drawings of each browser's extensions page (not screenshots, so they follow the app theme),
 * with the control to click marked by a pulsing ring and a mouse pointer. They are always
 * left-to-right because the browser pages they depict are.
 */

export const BROWSER_LOGOS: Record<BrowserId, string> = {
  chrome: chromeLogo,
  edge: edgeLogo,
  brave: braveLogo,
  opera: operaLogo,
  vivaldi: vivaldiLogo,
  firefox: firefoxLogo
}

/** Colour of each browser's switched-on toggles */
const TOGGLE_COLORS: Record<BrowserId, string> = {
  chrome: '#1a73e8',
  edge: '#0f6cbd',
  brave: '#fb542b',
  opera: '#ff1b2d',
  vivaldi: '#ef3939',
  firefox: '#0061e0'
}

function Window(props: { browser: BrowserId; title: string; url: string; children: ReactNode }) {
  return (
    <div className="shot" dir="ltr" aria-hidden="true">
      <div className="shot-tabs">
        <span className="shot-tab">
          <img src={BROWSER_LOGOS[props.browser]} alt="" />
          {props.title}
        </span>
      </div>
      <div className="shot-url">{props.url}</div>
      <div className="shot-page">{props.children}</div>
    </div>
  )
}

/** Marks what to click; `n` numbers it when a picture has more than one */
function Target(props: { n?: number; children: ReactNode }) {
  return (
    <span className="shot-target">
      {props.children}
      {props.n ? (
        <span className="shot-num">{props.n}</span>
      ) : (
        <svg className="shot-pointer" viewBox="0 0 16 22" width="16" height="22">
          <path d="M1 1v17l4.5-4 3 7 3-1.3-3-6.8H14z" fill="#fff" stroke="#000" strokeWidth="1.3" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  )
}

const Toggle = ({ browser, on }: { browser: BrowserId; on: boolean }) => (
  <span className={`shot-toggle ${on ? 'on' : ''}`} style={on ? { background: TOGGLE_COLORS[browser] } : undefined} />
)

/** Grey placeholders standing in for already installed extensions */
const Cards = () => (
  <div className="shot-cards">
    <span />
    <span />
    <span />
  </div>
)

const Actions = ({ target }: { target: boolean }) => (
  <div className="shot-actions">
    {target ? (
      <Target>
        <span className="shot-btn">Load unpacked</span>
      </Target>
    ) : (
      <span className="shot-btn">Load unpacked</span>
    )}
    <span className="shot-btn">Pack extension</span>
    <span className="shot-btn">Update</span>
  </div>
)

/** A Chromium extensions page. `devMode` false → point at the switch; true → point at Load unpacked */
export function ExtensionsPageShot({ browser, devMode }: { browser: BrowserId; devMode: boolean }) {
  const toggle = <Toggle browser={browser} on={devMode} />
  const devSwitch = (
    <span className="shot-dev">
      Developer mode {devMode ? toggle : <Target>{toggle}</Target>}
    </span>
  )

  // Edge keeps the switch in its left sidebar; the rest put it in the top bar
  if (browser === 'edge') {
    return (
      <Window browser={browser} title="Extensions" url="edge://extensions">
        <div className="shot-split">
          <div className="shot-side">
            <b>Extensions</b>
            <span className="shot-item active">Extensions</span>
            <span className="shot-item">Keyboard shortcuts</span>
            <span className="shot-grow" />
            {devSwitch}
          </div>
          <div className="shot-main">
            <b>Installed extensions</b>
            {devMode && <Actions target />}
            <Cards />
          </div>
        </div>
      </Window>
    )
  }
  return (
    <Window browser={browser} title="Extensions" url={`${browser}://extensions`}>
      <div className="shot-head">
        <b>Extensions</b>
        <span className="shot-search" />
        {devSwitch}
      </div>
      {devMode && <Actions target />}
      <Cards />
    </Window>
  )
}

/** A new browser window: paste the extensions address (1) and press Enter */
export function AddressBarShot({ browser, url }: { browser: BrowserId; url: string }) {
  return (
    <div className="shot" dir="ltr" aria-hidden="true">
      <div className="shot-tabs">
        <span className="shot-tab">
          <img src={BROWSER_LOGOS[browser]} alt="" />
          New Tab
        </span>
      </div>
      <div className="shot-url shot-url-row">
        <Target n={1}>
          <span className="shot-address">{url}</span>
        </Target>
        <span className="shot-key">Ctrl+V</span>
        <span className="shot-key">Enter ↵</span>
      </div>
      <div className="shot-page">
        <Cards />
      </div>
    </div>
  )
}

/** Firefox's "Add Downly?" prompt that opens with the signed package */
export function FirefoxAddShot() {
  return (
    <Window browser="firefox" title="Firefox" url="downly-firefox.xpi">
      <div className="shot-popup">
        <b>Add Downly?</b>
        <span className="shot-line" />
        <span className="shot-line short" />
        <div className="shot-popup-buttons">
          <Target>
            <span className="shot-btn primary" style={{ background: TOGGLE_COLORS.firefox }}>
              Add
            </span>
          </Target>
          <span className="shot-btn">Cancel</span>
        </div>
      </div>
    </Window>
  )
}

/** about:debugging, where Firefox loads an unsigned (temporary) add-on */
export function FirefoxDebuggingShot() {
  return (
    <Window browser="firefox" title="Debugging" url="about:debugging#/runtime/this-firefox">
      <div className="shot-split">
        <div className="shot-side">
          <span className="shot-item">Setup</span>
          <span className="shot-item active">This Firefox</span>
        </div>
        <div className="shot-main">
          <div className="shot-head">
            <b>Temporary Extensions</b>
            <span className="shot-grow" />
            <Target>
              <span className="shot-btn">Load Temporary Add-on…</span>
            </Target>
          </div>
          <Cards />
        </div>
      </div>
    </Window>
  )
}

/**
 * The system file dialog: paste the path, (pick the file,) then confirm — numbered in that order.
 * `file` set → picking that file (Firefox); otherwise picking the folder itself (Chromium).
 */
export function FilePickerShot({ platform, file }: { platform: string; file?: string }) {
  const paste = platform === 'darwin' ? 'Go to folder: ⌘V' : platform === 'linux' ? 'Ctrl+L, Ctrl+V' : 'Ctrl+V'
  const confirm = file ? 'Open' : platform === 'win32' ? 'Select Folder' : 'Select'
  const entries = ['_locales', 'icons', 'background.js', 'manifest.json']
  return (
    <div className="shot" dir="ltr" aria-hidden="true">
      <div className="shot-dialog-title">{file ? 'Open' : 'Select the folder'}</div>
      <div className="shot-page">
        <div className="shot-head">
          <Target n={1}>
            <span className="shot-address">{paste}</span>
          </Target>
        </div>
        <div className="shot-files">
          {entries.map((name) =>
            name === file ? (
              <Target key={name} n={2}>
                <span className="shot-file selected">{name}</span>
              </Target>
            ) : (
              <span key={name} className="shot-file">
                {name}
              </span>
            )
          )}
        </div>
        <div className="shot-popup-buttons end">
          <Target n={file ? 3 : 2}>
            <span className="shot-btn primary">{confirm}</span>
          </Target>
          <span className="shot-btn">Cancel</span>
        </div>
      </div>
    </div>
  )
}

/** IDM's Options → General tab, pointing at the browser integration checkbox to clear */
export function IdmOptionsShot() {
  return (
    <div className="shot" dir="ltr" aria-hidden="true">
      <div className="shot-dialog-title">Configuration</div>
      <div className="shot-page">
        <div className="shot-actions">
          <span className="shot-btn primary">General</span>
          <span className="shot-btn">File types</span>
          <span className="shot-btn">Connection</span>
          <span className="shot-btn">Save to</span>
        </div>
        <div className="shot-head">
          <Target>
            <span className="shot-check">Use advanced browser integration</span>
          </Target>
        </div>
        <div className="shot-files">
          <span className="shot-file">☐ Chrome</span>
          <span className="shot-file">☐ Edge</span>
          <span className="shot-file">☐ Firefox</span>
        </div>
        <div className="shot-popup-buttons end">
          <span className="shot-btn primary">OK</span>
        </div>
      </div>
    </div>
  )
}
