import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider } from "./context/AuthContext";
import { CartProvider } from "./context/CartContext";
import Header from "./components/Header";
import CategoryNav from "./components/CategoryNav";
import Footer from "./components/Footer";
import StickyCart from "./components/StickyCart";
import HomePage from "./pages/HomePage";
import CategoryPage from "./pages/CategoryPage";
import ProductDetailPage from "./pages/ProductDetailPage";
import LoginPage from "./pages/LoginPage";
import SignupPage from "./pages/SignupPage";
import SellerLoginPage from "./pages/SellerLoginPage";
import SellerSignupPage from "./pages/SellerSignupPage";
import SellerDashboardPage from "./pages/SellerDashboardPage";
import CartPage from "./pages/CartPage";
import "./App.css";

export default function App() {
  return (
    <AuthProvider>
      <CartProvider>
        <BrowserRouter>
          <div className="App min-h-screen flex flex-col bg-off-white">
            <Header />
            <CategoryNav />
            <main className="flex-1">
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/category/:slug" element={<CategoryPage />} />
                <Route path="/product/:id" element={<ProductDetailPage />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/signup" element={<SignupPage />} />
                <Route path="/seller/login" element={<SellerLoginPage />} />
                <Route path="/seller/signup" element={<SellerSignupPage />} />
                <Route path="/seller/dashboard" element={<SellerDashboardPage />} />
                <Route path="/cart" element={<CartPage />} />
              </Routes>
            </main>
            <Footer />
            <StickyCart />
          </div>
          <Toaster position="top-right" richColors />
        </BrowserRouter>
      </CartProvider>
    </AuthProvider>
  );
}
