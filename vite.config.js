import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'
import {resolve} from 'path'
export default defineConfig({plugins:[react({babel:{babelrc:false,configFile:false}})],build:{rollupOptions:{input:{main:resolve(__dirname,'index.html'),sandbox:resolve(__dirname,'sandbox.html')}}}})
