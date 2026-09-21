import Home from "./pages/Home/Home";
import Workflow from "./pages/Workflow/Workflow";
import UserManagement from "./pages/UserManagement/UserManagement";
import Queries from "./pages/Queries/Queries";
import QueryDetails from "./pages/Queries/QueryDetails/QueryDetails";
import Policies from "./pages/Policies/Policies";
import PolicyDetails from "./pages/Policies/PolicyDetails/PolicyDetails";
import MyProfile from "./pages/MyProfile/MyProfile";
import FlowCategories from "./pages/FlowCategories/FlowCategories";
import Sops from "./pages/Sops/Sops";
import Flagged from "./pages/Flagged/Flagged";
import FlaggedDetails from "./pages/Flagged/FlaggedDetails/FlaggedDetails";
import CreateSop from "./pages/CreateSop/CreateSop";
import CreatePolicy from "./pages/CreatePolicy/CreatePolicy";
import CreateRequest from "./pages/CreateRequest/CreateRequest";
import ForgotPassword from "./pages/ForgotPassword/ForgotPassword";
import Signup from "./pages/Signup/Signup";
import CompletionStatus from "./pages/CompletionStatus/CompletionStatus";
import CompletionStatusDetails from "./pages/CompletionStatus/CompletionStatusDetails/CompletionStatusDetails";
import RequestDetails from "./pages/Requests/RequestDetails/RequestDetails";
import Requests from "./pages/Requests/Requests";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Login from "./pages/Login/Login";
import Dashboard from "./pages/Dashboard/Dashboard";
import RequestMaterials from "./pages/Requests/RequestMaterials/RequestMaterials";
import NavigationPane from "./components/NavigationPane";
function AppRoutes() {
  return (
    <BrowserRouter>
      <NavigationPane>
        <Routes>
          <Route path="/workflow" element={<Workflow />} />
          <Route path="/user-management" element={<UserManagement />} />
          <Route path="/sops" element={<Sops />} />
          <Route path="/queries" element={<Queries />} />
          <Route path="/queries/:id" element={<QueryDetails />} />
          <Route path="/policies" element={<Policies />} />
          <Route path="/policies/:id" element={<PolicyDetails />} />
          <Route path="/my-profile" element={<MyProfile />} />
          <Route path="/flow-categories" element={<FlowCategories />} />
          <Route path="/flagged" element={<Flagged />} />
          <Route path="/flagged/:id" element={<FlaggedDetails />} />
          <Route path="/create-sop" element={<CreateSop />} />
          <Route path="/requests/:id" element={<RequestDetails />} />
          <Route path="/requests/:id/materials" element={<RequestMaterials />} />
          <Route path="/" element={<Home />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/create-policy" element={<CreatePolicy />} />
          <Route path="/create-request" element={<CreateRequest />} />
          <Route path="/requests" element={<Requests />} />
          <Route path="/completion-status" element={<CompletionStatus />} />
          <Route path="/completion-status/:id" element={<CompletionStatusDetails />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
        </Routes>
      </NavigationPane>
    </BrowserRouter>
  );
}

export default AppRoutes;