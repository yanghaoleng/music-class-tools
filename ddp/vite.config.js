import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({base:'/ddp/',plugins:[react()],server:{proxy:{'/ddp/api':'http://127.0.0.1:8796'}}});
