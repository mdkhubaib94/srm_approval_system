
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import PasswordInput from "../../common/PasswordInput";
import SRMRMP_Logo from "../../assets/SRMRMP_LOGO.png";
import InstitutionSelect from "../../common/InstitutionSelect";
import NestedSelect from "../../common/NestedSelect";
import { useAuth } from "../../context/AuthContext";
import styles from "./Signup.module.css";
import {
  DENTAL_DEPARTMENTS,
  ENGINEERING_DEPARTMENTS,
  FSH_DEPARTMENTS,
  EEC_DEPARTMENTS,
  MANAGEMENT_DEPARTMENTS,
  SEAD_DEPARTMENTS,
  SRM_NIGHTINGALE_SCHOOL_DEPARTMENTS,
  OTHER_DEPARTMENTS,
} from "../../utils/constants";

// Match exactly the role values the backend User model accepts
const roleOptions = [
  { value: "REQUESTER", label: "Requester / HOD" },
  { value: "INSTITUTION_MANAGER", label: "Institution Manager" },
  { value: "ACCOUNTANT", label: "Accountant" },
  { value: "HEAD_OF_INSTITUTION", label: "Head of Institution" },
  { value: "CHAIRMAN_OFFICE", label: "Chairman Office" },
  { value: "HR_HEAD", label: "HR Head" },
  { value: "MMA", label: "MMA" },
  { value: "MANAGER_DATA_MANAGEMENT", label: "Manager - Data Management" },
  { value: "AUDIT", label: "Audit" },
  { value: "MANAGER_ACCOUNTS", label: "Manager - Accounts" },
  { value: "GM_FINANCE", label: "GM Finance" },
  { value: "DIRECTOR_ADMISSIONS", label: "Director Admissions" },
  { value: "DIRECTOR_RESEARCH", label: "Director Research" },
  { value: "DEAN_ADMIN", label: "Dean Admin" },
  { value: "CHIEF_DIRECTOR", label: "Chief Director" },
  { value: "CHAIRMAN", label: "Chairman" },
];

// Roles where department selection is shown (only for roles at institution level and above)
const rolesWithDepartment = ["REQUESTER"];

// Roles where institution selection is shown (only for roles at institution level and above)  
const rolesWithCollege = ["REQUESTER", "INSTITUTION_MANAGER", "ACCOUNTANT", "HEAD_OF_INSTITUTION"];

const getDepartmentOptions = (college) => {
  if (college === "DENTAL") return DENTAL_DEPARTMENTS;
  if (college === "EEC") return EEC_DEPARTMENTS;
  if (college?.includes("FSH")) return FSH_DEPARTMENTS;
  if (college?.includes("Management")) return MANAGEMENT_DEPARTMENTS;
  if (college?.includes("SEAD")) return SEAD_DEPARTMENTS;
  if (college === "SRM Nightingale School") return SRM_NIGHTINGALE_SCHOOL_DEPARTMENTS;
  if (college === "Others") return OTHER_DEPARTMENTS;
  return ENGINEERING_DEPARTMENTS;
};

export default function SignupPage() {
  const [name, setName] = useState("");
  const [empId, setEmpId] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [selectedRole, setSelectedRole] = useState("REQUESTER");
  const [college, setCollege] = useState("");
  const [department, setDepartment] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const navigate = useNavigate();
  const { register } = useAuth();

  const inputClass = styles.input;

  const handleRoleChange = (role) => {
    setSelectedRole(role);
    if (!rolesWithDepartment.includes(role)) setDepartment("");
    if (!rolesWithCollege.includes(role)) setCollege("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters long");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    const phoneDigits = phone.replace(/\D/g, "");
    if (phoneDigits.length !== 10) {
      setError("Contact number must be exactly 10 digits");
      return;
    }

    const needsCollege = rolesWithCollege.includes(selectedRole);
    const needsDepartment = rolesWithDepartment.includes(selectedRole);

    if (needsCollege && !college) {
      setError("Please select an institution");
      return;
    }
    if (needsDepartment && !department) {
      setError("Please select a department");
      return;
    }

    setLoading(true);
    try {
      await register({
        name,
        employeeID: empId,
        email,
        phone: phoneDigits,
        password,
        role: selectedRole,
        institution: needsCollege ? college : "COMMON",
        department: needsDepartment ? department : undefined,
      });

      navigate("/login?message=Account created successfully! Please sign in.");
    } catch (err) {
      console.error("Error creating account:", err);
      setError(err.response?.data?.message || err.message || "Failed to create account. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Registration Form Step
  return (
    <div className={styles.container}>
      <div className={styles.wrapper}>
        {/* Logo */}
        <div className={styles.logoHeader}>
          <img src={SRMRMP_Logo} alt="SRM Logo" width={100} height={100} className={styles.logo}  />
          <h1 className={styles.title}>
            SRM-RMP Approval System
          </h1>
          <p className={styles.subtitle}>Create your account</p>
        </div>

        <div className={styles.card}>
          {error && (
            <div className={styles.errorBox}>
              {error}
            </div>
          )}

          <form className={styles.form} onSubmit={handleSubmit} autoComplete="off">
            {/* Full Name */}
            <div>
              <label className={styles.label}>Full Name *</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter your full name"
                autoComplete="off"
                className={inputClass}
              />
            </div>

            {/* Employee ID */}
            <div>
              <label className={styles.label}>Employee ID *</label>
              <input
                type="text"
                required
                value={empId}
                onChange={(e) => setEmpId(e.target.value)}
                placeholder="Enter your employee ID"
                autoComplete="off"
                className={inputClass}
              />
            </div>

            {/* Email */}
            <div>
              <label className={styles.label}>Email Address *</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@srmrmp.edu.in"
                autoComplete="off"
                className={inputClass}
              />
            </div>

            {/* Phone */}
            <div>
              <label className={styles.label}>Contact Number *</label>
              <input
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="10-digit mobile number"
                autoComplete="off"
                className={inputClass}
              />
            </div>

            {/* Password */}
            <div>
              <label className={styles.label}>Password *</label>
              <PasswordInput
                value={password}
                onChange={setPassword}
                required
                placeholder="Enter your password"
                autoComplete="new-password"
              />
            </div>

            {/* Confirm Password */}
            <div>
              <label className={styles.label}>Confirm Password *</label>
              <PasswordInput
                value={confirmPassword}
                onChange={setConfirmPassword}
                required
                placeholder="Re-enter your password"
                autoComplete="new-password"
              />
            </div>

            {/* Role */}
            <div>
              <label className={styles.label}>Role *</label>
              <select
                value={selectedRole}
                onChange={(e) => handleRoleChange(e.target.value)}
                className={inputClass}
              >
                {roleOptions.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Institution — only for roles that need institution */}
            {rolesWithCollege.includes(selectedRole) && (
              <div>
                <label className={styles.labelMargin}>Institution *</label>
                <InstitutionSelect value={college} onChange={setCollege} />
              </div>
            )}

            {/* Department — only for REQUESTER */}
            {rolesWithDepartment.includes(selectedRole) && (
              <div>
                <label className={styles.labelMargin}>Department *</label>
                <NestedSelect
                  value={department}
                  onChange={setDepartment}
                  options={getDepartmentOptions(college)}
                  placeholder="Select Department"
                  dropUp={true}
                  disabled={!college}
                />
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className={styles.submitBtn}
            >
              {loading ? "Creating account..." : "Create Account"}
            </button>
          </form>

          <div className={styles.footer}>
            <p className={styles.footerText}>
              Already have an account?{" "}
              <button
                onClick={() => navigate("/login")}
                className={styles.linkBtn}
              >
                Sign in
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
