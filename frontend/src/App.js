import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider } from "./context/AuthContext";
import { CartProvider } from "./context/CartContext";
import { DeliveryProvider } from "./context/DeliveryContext";
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
import CheckoutPage from "./pages/CheckoutPage";
import OrderConfirmationPage from "./pages/OrderConfirmationPage";
import AccountLayout from "./pages/AccountLayout";
import AccountProfilePage from "./pages/AccountProfilePage";
import MyOrdersPage from "./pages/MyOrdersPage";
import OrderDetailPage from "./pages/OrderDetailPage";
import AddressesPage from "./pages/AddressesPage";
import SellerBulkUploadPage from "./pages/SellerBulkUploadPage";
import SellerOrdersPage from "./pages/SellerOrdersPage";
import AdminLoginPage from "./pages/AdminLoginPage";
import AdminLayout from "./pages/AdminLayout";
import AdminDashboardPage from "./pages/AdminDashboardPage";
import AdminSellersPage from "./pages/AdminSellersPage";
import AdminProductsPage from "./pages/AdminProductsPage";
import AdminOrdersPage from "./pages/AdminOrdersPage";
import AdminDuesPage from "./pages/AdminDuesPage";
import SellerSubscriptionPage from "./pages/SellerSubscriptionPage";
import SellerDuesPage from "./pages/SellerDuesPage";
import "./App.css";

export default function App() {
  return (
    <AuthProvider>
      <DeliveryProvider>
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
                <Route path="/seller/bulk-upload" element={<SellerBulkUploadPage />} />
                <Route path="/seller/orders" element={<SellerOrdersPage />} />
                <Route path="/seller/subscription" element={<SellerSubscriptionPage />} />
                <Route path="/seller/dues" element={<SellerDuesPage />} />
                <Route path="/cart" element={<CartPage />} />
                <Route path="/checkout" element={<CheckoutPage />} />
                <Route path="/order/success/:id" element={<OrderConfirmationPage />} />
                <Route path="/account" element={<AccountLayout />}>
                  <Route index element={<AccountProfilePage />} />
                  <Route path="orders" element={<MyOrdersPage />} />
                  <Route path="orders/:id" element={<OrderDetailPage />} />
                  <Route path="addresses" element={<AddressesPage />} />
                </Route>
                <Route path="/admin/login" element={<AdminLoginPage />} />
                <Route path="/admin" element={<AdminLayout />}>
                  <Route index element={<AdminDashboardPage />} />
                  <Route path="sellers" element={<AdminSellersPage />} />
                  <Route path="products" element={<AdminProductsPage />} />
                  <Route path="orders" element={<AdminOrdersPage />} />
                  <Route path="dues" element={<AdminDuesPage />} />
                </Route>
              </Routes>
            </main>
            <Footer />
            <StickyCart />
          </div>
          <Toaster position="top-right" richColors />
        </BrowserRouter>
      </CartProvider>
      </DeliveryProvider>
    </AuthProvider>
  );
}
