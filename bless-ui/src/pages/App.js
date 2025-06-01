// App.js
import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import Home from "./Home.js";
import MainLayout from "../layout/MainLayout.js";
import FileExplorer from "./FileExplorer.js";


function App() {
  return (
    <BrowserRouter>
      <Toaster position="top-center" />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/" element={<MainLayout />}>
          <Route index element={<FileExplorer />} />
          <Route path="dashboard" element={<FileExplorer />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
