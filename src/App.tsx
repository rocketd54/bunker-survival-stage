import {ReactRunner} from "@chub-ai/stages-ts";
import {Stage} from "./Stage";
import TestRunner from "./TestRunner";


function App() {
  // isDev is true ONLY when running via `vite dev` locally.
  // Chub serves stages in an iframe and does NOT set MODE to 'development',
  // but to be safe we also check for the absence of Chub's host bridge.
  // If either flag says "production", we render the real stage.
  const isDev = import.meta.env.DEV === true
      && import.meta.env.MODE === 'development'
      && !(window as any).__CHUB_STAGE__;

  console.info(`Running in ${import.meta.env.MODE} | isDev=${isDev}`);

  return isDev ? <TestRunner/> :
      <ReactRunner factory={(data: any) => new Stage(data)} />;
}

export default App