import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({base:'/cal/',plugins:[react()],server:{proxy:{'/cal/api':'http://127.0.0.1:8802'}}});
