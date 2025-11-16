import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import axios from "axios";
import { Ionicons } from "@expo/vector-icons";
import { API_BASE } from "../../constants/api";

type Account = {
  id: string;
  name: string;
  type: string; // "cash" | "bank" | "card" | etc.
  currency: string;
  balance: number;
  last4?: string | null;
};

type Summary = {
  assets: number;
  liabilities: number;
  total: number;
};

const TYPE_LABELS: Record<string, string> = {
  cash: "💵 Cash",
  bank: "🏦 Bank",
  card: "💳 Card",
};

const TYPE_COLORS: Record<string, string> = {
  cash: "#22c55e",
  bank: "#38bdf8",
  card: "#f97316",
  default: "#e5e7eb",
};

export default function AccountsScreen() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [summary, setSummary] = useState<Summary>({
    assets: 0,
    liabilities: 0,
    total: 0,
  });

  const [addModalVisible, setAddModalVisible] = useState(false);
  const [formName, setFormName] = useState("");
  const [formType, setFormType] = useState<"cash" | "bank" | "card">("cash");
  const [formBalance, setFormBalance] = useState("");
  const [formLast4, setFormLast4] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // which account is in "delete mode"
  const [deleteAccountId, setDeleteAccountId] = useState<string | null>(null);

  const fetchAccounts = () => {
    axios
      .get(`${API_BASE}/accounts`)
      .then((res) => setAccounts(res.data || []))
      .catch((err) => console.log("Accounts error", err));
  };

  const fetchSummary = () => {
    axios
      .get(`${API_BASE}/accounts/summary`)
      .then((res) =>
        setSummary({
          assets: res.data.assets ?? 0,
          liabilities: res.data.liabilities ?? 0,
          total: res.data.total ?? 0,
        })
      )
      .catch((err) => console.log("Accounts summary error", err));
  };

  useEffect(() => {
    fetchAccounts();
    fetchSummary();
  }, []);

  // Hook into global refresh button
  useEffect(() => {
    const fn = () => {
      fetchAccounts();
      fetchSummary();
    };

    (globalThis as any).__refreshAccounts = fn;

    return () => {
      if ((globalThis as any).__refreshAccounts === fn) {
        (globalThis as any).__refreshAccounts = undefined;
      }
    };
  }, []);

  // ---- Add account ----
  const openAddModal = () => {
    setFormName("");
    setFormType("cash");
    setFormBalance("");
    setFormLast4("");
    setSaveError(null);
    setAddModalVisible(true);
  };

  const handleCancelAdd = () => {
    setAddModalVisible(false);
  };

  const handleSaveAccount = async () => {
    setSaveError(null);

    if (!formName.trim()) {
      setSaveError("Please enter a name.");
      return;
    }

    const balNum = formBalance.trim()
      ? Number(formBalance.trim())
      : 0;

    if (Number.isNaN(balNum)) {
      setSaveError("Balance must be a valid number.");
      return;
    }

    const payload = {
      name: formName.trim(),
      type: formType,
      currency: "INR",
      balance: balNum,
      last4: formLast4.trim() || null,
    };

    try {
      setSaving(true);
      await axios.post(`${API_BASE}/accounts`, payload);
      setAddModalVisible(false);
      fetchAccounts();
      fetchSummary();
    } catch (err) {
      console.log("Save account error", err);
      setSaveError("Failed to save account. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  // ---- Delete account ----
  const handleDeleteAccount = async (id: string) => {
    try {
      await axios.delete(`${API_BASE}/accounts/${id}`);
      fetchAccounts();
      fetchSummary();
      setDeleteAccountId(null);
    } catch (err) {
      console.log("Delete account error", err);
    }
  };

  // ---- Render account card ----
  const renderAccount = ({ item }: { item: Account }) => {
    const color = TYPE_COLORS[item.type] ?? TYPE_COLORS.default;
    const label = TYPE_LABELS[item.type] ?? item.type.toUpperCase();
    const isNegative = item.balance < 0;
    const isDeleteMode = deleteAccountId === item.id;

    const handleLongPress = () => {
      if (isDeleteMode) {
        // long-press again on same card → cancel delete state
        setDeleteAccountId(null);
      } else {
        // enter delete mode for this card
        setDeleteAccountId(item.id);
      }
    };

    const handlePress = () => {
      if (isDeleteMode) {
        // tap while in delete mode = confirm delete
        handleDeleteAccount(item.id);
      } else {
        // normal tap: also clear any other delete state
        setDeleteAccountId(null);
      }
    };


    // 🔴 If in delete mode, show red glassy delete state (same as TX)
    if (isDeleteMode) {
      return (
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={handlePress}
          onLongPress={handleLongPress}
          style={{ marginBottom: 10 }}
        >
          <View style={styles.cardWrapper}>
            <View style={[styles.cardAccent, styles.cardAccentDelete]} />
            <View style={[styles.card, styles.cardDelete]}>
              <View style={{ flex: 1, alignItems: "center" }}>
                <Ionicons name="trash" size={20} color="#fff" />
                <Text style={styles.deleteSub}>Tap again to confirm</Text>
              </View>
            </View>
          </View>
        </TouchableOpacity>
      );
    }

    // Normal state
    return (
      <TouchableOpacity
        activeOpacity={0.85}
        onLongPress={handleLongPress}
        onPress={handlePress}
        style={{ marginBottom: 10 }}
      >
        <View style={styles.cardWrapper}>
          <View
            style={[
              styles.cardAccent,
              { backgroundColor: color },
            ]}
          />
          <View style={styles.card}>
            {/* Left: name + type + last4 */}
            <View style={styles.cardLeft}>
              <Text style={styles.accName}>{item.name}</Text>
              <Text style={styles.accType}>{label}</Text>
              {item.last4 ? (
                <Text style={styles.accLast4}>•••• {item.last4}</Text>
              ) : null}
            </View>

            {/* Right: balance */}
            <View style={styles.cardRight}>
              <Text style={styles.balanceLabel}>Balance</Text>
              <Text
                style={[
                  styles.balanceValue,
                  { color: isNegative ? "#fb7185" : "#6ee7b7" },
                ]}
              >
                ₹{item.balance.toFixed(2)}
              </Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Add Account Modal */}
      <Modal
        visible={addModalVisible}
        transparent
        animationType="slide"
        onRequestClose={handleCancelAdd}
      >
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={{ flex: 1, justifyContent: "flex-end" }}
          >
            <View style={styles.addModalContent}>
              <Text style={styles.modalHeader}>Add Account</Text>

              {/* Name */}
              <View style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>Name</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. HDFC Salary, Cash Wallet"
                  placeholderTextColor="#6b7280"
                  value={formName}
                  onChangeText={setFormName}
                />
              </View>

              {/* Type chips */}
              <View style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>Type</Text>
                <View style={styles.typeRow}>
                  {(["cash", "bank", "card"] as const).map((t) => {
                    const active = formType === t;
                    return (
                      <TouchableOpacity
                        key={t}
                        style={[
                          styles.typeChip,
                          active && styles.typeChipActive,
                        ]}
                        onPress={() => setFormType(t)}
                      >
                        <Text
                          style={[
                            styles.typeChipText,
                            active && styles.typeChipTextActive,
                          ]}
                        >
                          {TYPE_LABELS[t]}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Balance */}
              <View style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>Starting Balance (₹)</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  placeholder="e.g. 15000"
                  placeholderTextColor="#6b7280"
                  value={formBalance}
                  onChangeText={setFormBalance}
                />
                <Text style={styles.hintText}>
                  You can keep it 0 and let it grow with transactions.
                </Text>
              </View>

              {/* Last4 */}
              <View style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>Last 4 digits (optional)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. 1234"
                  placeholderTextColor="#6b7280"
                  keyboardType="numeric"
                  maxLength={4}
                  value={formLast4}
                  onChangeText={setFormLast4}
                />
              </View>

              {saveError && (
                <Text style={styles.errorText}>{saveError}</Text>
              )}

              {/* Buttons */}
              <View className="buttons" style={styles.addButtonsRow}>
                <TouchableOpacity
                  style={[styles.addButton, styles.addCancelButton]}
                  onPress={handleCancelAdd}
                  disabled={saving}
                >
                  <Text style={styles.addButtonText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.addButton, styles.addSaveButton]}
                  onPress={handleSaveAccount}
                  disabled={saving}
                >
                  <Text style={styles.addButtonText}>
                    {saving ? "Saving..." : "Save"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Summary bar */}
      <View style={styles.summaryRow}>
        <View style={[styles.summaryBox, { borderColor: "#6ee7b7" }]}>
          <Text style={styles.summaryLabel}>Assets</Text>
          <Text style={[styles.summaryValue, { color: "#bbf7d0" }]}>
            ₹{summary.assets.toFixed(2)}
          </Text>
        </View>

        <View style={[styles.summaryBox, { borderColor: "#fb7185" }]}>
          <Text style={styles.summaryLabel}>Liabilities</Text>
          <Text style={[styles.summaryValue, { color: "#fecaca" }]}>
            ₹{summary.liabilities.toFixed(2)}
          </Text>
        </View>

        <View style={[styles.summaryBox, { borderColor: "#93c5fd" }]}>
          <Text style={styles.summaryLabel}>Net</Text>
          <Text
            style={[
              styles.summaryValue,
              {
                color:
                  summary.total >= 0 ? "#bfdbfe" : "#fed7d7",
              },
            ]}
          >
            ₹{summary.total.toFixed(2)}
          </Text>
        </View>
      </View>

      {/* Accounts list */}
      <FlatList
        data={accounts}
        keyExtractor={(item) => item.id}
        renderItem={renderAccount}
        contentContainerStyle={{ paddingBottom: 80 }}
      />

      {/* Floating + button */}
      <TouchableOpacity
        style={styles.fab}
        onPress={openAddModal}
        activeOpacity={0.8}
      >
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#020617",
    padding: 16,
  },

  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  summaryBox: {
    width: "32%",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 18,
    backgroundColor: "#020617",
    borderWidth: 1.2,
  },
  summaryLabel: { color: "#9ca3af", fontSize: 12, marginBottom: 4 },
  summaryValue: { color: "#f9fafb", fontSize: 15, fontWeight: "bold" },

  cardWrapper: {
    flexDirection: "row",
    alignItems: "stretch",
    marginBottom: 10,
  },
  cardAccent: {
    width: 4,
    borderRadius: 999,
    marginRight: 8,
  },
  card: {
    flex: 1,
    backgroundColor: "#020617",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 20,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#1f2937",
    position: "relative",
  },
  cardLeft: {
    flex: 1,
  },
  cardRight: {
    alignItems: "flex-end",
    marginLeft: 10,
  },
  accName: {
    color: "#f9fafb",
    fontSize: 15,
    fontWeight: "600",
  },
  accType: {
    color: "#9ca3af",
    fontSize: 13,
    marginTop: 2,
  },
  accLast4: {
    color: "#6b7280",
    fontSize: 12,
    marginTop: 2,
  },
  balanceLabel: {
    color: "#9ca3af",
    fontSize: 12,
  },
  balanceValue: {
    fontSize: 16,
    fontWeight: "bold",
    marginTop: 2,
  },

  // delete state (same vibe as transaction cards)
  cardDelete: {
    backgroundColor: "rgba(127, 29, 29, 0.75)", // deep red glassy
    borderColor: "#ef4444",
  },
  cardAccentDelete: {
    backgroundColor: "#ef4444",
  },
  deleteSub: {
    color: "#fecaca",
    fontSize: 12,
    marginTop: 4,
    textAlign: "center",
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.75)",
    justifyContent: "flex-end",
  },
  addModalContent: {
    backgroundColor: "#020617",
    padding: 20,
    paddingBottom: 16,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: "#1f2937",
  },
  modalHeader: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#f9fafb",
    marginBottom: 16,
    textAlign: "center",
  },
  fieldBlock: {
    marginBottom: 14,
  },
  fieldLabel: {
    color: "#e5e7eb",
    marginBottom: 6,
    fontSize: 14,
  },
  input: {
    backgroundColor: "#020617",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: "#f9fafb",
    borderWidth: 1,
    borderColor: "#1f2937",
  },
  hintText: {
    color: "#6b7280",
    fontSize: 11,
    marginTop: 4,
  },
  errorText: {
    color: "#fb7185",
    marginTop: 4,
    fontSize: 13,
  },

  typeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  typeChip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#1f2937",
    marginRight: 8,
    marginBottom: 8,
    backgroundColor: "#020617",
  },
  typeChipActive: {
    backgroundColor: "#111827",
    borderColor: "#38bdf8",
  },
  typeChipText: {
    color: "#e5e7eb",
    fontSize: 13,
  },
  typeChipTextActive: {
    fontWeight: "600",
    color: "#dbeafe",
  },

  addButtonsRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 12,
  },
  addButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 999,
    marginLeft: 8,
  },
  addCancelButton: {
    backgroundColor: "#020617",
    borderWidth: 1,
    borderColor: "#1f2937",
  },
  addSaveButton: {
    backgroundColor: "#22c55e",
  },
  addButtonText: {
    color: "#f9fafb",
    fontWeight: "600",
  },

  fab: {
    position: "absolute",
    right: 20,
    bottom: 30,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#fb7185",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  fabText: {
    color: "#f9fafb",
    fontSize: 32,
    lineHeight: 34,
    fontWeight: "bold",
  },
});
