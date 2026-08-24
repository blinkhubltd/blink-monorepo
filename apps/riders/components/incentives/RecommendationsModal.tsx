import React, { useState } from "react";
import {
  View,
  TouchableOpacity,
  Modal,
  Dimensions,
  ScrollView,
  TextInput,
} from "react-native";
import { Text } from "@/components/ui/text";
import { THEME } from "@/theme/design";
import { formatKES } from "@/lib/currency";
import Ionicons from "@expo/vector-icons/Ionicons";

interface RecommendationsModalProps {
  visible: boolean;
  onClose: () => void;
  recommendations: any[];
  saving: boolean;
  onApplyPlan: (targets: {
    daily: number;
    weekly: number;
    monthly: number;
  }) => Promise<void>;
  onSaveCustomPlan: (d: number, w: number, m: number) => Promise<void>;
}

export const RecommendationsModal: React.FC<RecommendationsModalProps> = ({
  visible,
  onClose,
  recommendations,
  saving,
  onApplyPlan,
  onSaveCustomPlan,
}) => {
  const [activeTab, setActiveTab] = useState<"recommended" | "custom">(
    "recommended"
  );
  const [customDaily, setCustomDaily] = useState("");
  const [customWeekly, setCustomWeekly] = useState("");
  const [customMonthly, setCustomMonthly] = useState("");

  const handleCustomSave = async () => {
    await onSaveCustomPlan(
      Number(customDaily) || 0,
      Number(customWeekly) || 0,
      Number(customMonthly) || 0
    );
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0, 0, 0, 0.8)",
          justifyContent: "flex-end",
        }}
      >
        <View
          style={{
            backgroundColor: THEME.colors.background,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            maxHeight: Dimensions.get("window").height * 0.85,
            minHeight: Dimensions.get("window").height * 0.6,
          }}
        >
          {/* Header */}
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              padding: 24,
              borderBottomWidth: 1,
              borderBottomColor: THEME.colors.border,
            }}
          >
            <Text
              style={{
                fontSize: 20,
                fontWeight: "700",
                color: THEME.colors.text,
              }}
            >
              Target Plans
            </Text>
            <TouchableOpacity
              onPress={onClose}
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                backgroundColor: THEME.colors.surface,
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Ionicons name="close" size={18} color={THEME.colors.text} />
            </TouchableOpacity>
          </View>

          {/* Tab Navigation */}
          <View
            style={{
              flexDirection: "row",
              padding: 16,
              backgroundColor: THEME.colors.surface,
            }}
          >
            <TouchableOpacity
              onPress={() => setActiveTab("recommended")}
              style={{
                flex: 1,
                paddingVertical: 12,
                paddingHorizontal: 16,
                borderRadius: 8,
                backgroundColor:
                  activeTab === "recommended"
                    ? THEME.colors.primary
                    : "transparent",
                alignItems: "center",
                marginRight: 8,
              }}
            >
              <Text
                style={{
                  fontWeight: "600",
                  color:
                    activeTab === "recommended"
                      ? "#000"
                      : THEME.colors.textSecondary,
                }}
              >
                Recommended
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setActiveTab("custom")}
              style={{
                flex: 1,
                paddingVertical: 12,
                paddingHorizontal: 16,
                borderRadius: 8,
                backgroundColor:
                  activeTab === "custom" ? THEME.colors.primary : "transparent",
                alignItems: "center",
                marginLeft: 8,
              }}
            >
              <Text
                style={{
                  fontWeight: "600",
                  color:
                    activeTab === "custom"
                      ? "#000"
                      : THEME.colors.textSecondary,
                }}
              >
                Custom Plan
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={{ flex: 1 }}>
            {activeTab === "recommended" ? (
              <View style={{ padding: 16 }}>
                <Text
                  style={{
                    fontSize: 14,
                    color: THEME.colors.textSecondary,
                    marginBottom: 16,
                    textAlign: "center",
                  }}
                >
                  Choose from our AI-optimized target plans
                </Text>

                {recommendations.map((rec: any, idx: number) => (
                  <View
                    key={idx}
                    style={{
                      backgroundColor: THEME.colors.surface,
                      padding: 20,
                      borderRadius: 16,
                      marginBottom: 16,
                      borderWidth: 1,
                      borderColor: THEME.colors.border,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: 16,
                      }}
                    >
                      <Text
                        style={{
                          fontWeight: "700",
                          fontSize: 18,
                          color: THEME.colors.text,
                        }}
                      >
                        {rec.label}
                      </Text>
                      {idx === 0 && (
                        <View
                          style={{
                            backgroundColor: THEME.colors.primary,
                            paddingHorizontal: 8,
                            paddingVertical: 4,
                            borderRadius: 12,
                            flexDirection: "row",
                            alignItems: "center",
                          }}
                        >
                          <Ionicons name="ribbon-outline" size={12} color="#000" style={{ marginRight: 4 }} />
                          <Text
                            style={{
                              fontSize: 10,
                              fontWeight: "600",
                              color: "#000",
                            }}
                          >
                            RECOMMENDED
                          </Text>
                        </View>
                      )}
                    </View>

                    {/* Targets Grid */}
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        marginBottom: 16,
                      }}
                    >
                      <View style={{ alignItems: "center" }}>
                        <Text
                          style={{
                            fontSize: 12,
                            color: THEME.colors.textSecondary,
                          }}
                        >
                          Daily
                        </Text>
                        <Text
                          style={{
                            fontSize: 20,
                            fontWeight: "700",
                            color: THEME.colors.text,
                          }}
                        >
                          {rec.targets.daily}
                        </Text>
                      </View>
                      <View style={{ alignItems: "center" }}>
                        <Text
                          style={{
                            fontSize: 12,
                            color: THEME.colors.textSecondary,
                          }}
                        >
                          Weekly
                        </Text>
                        <Text
                          style={{
                            fontSize: 20,
                            fontWeight: "700",
                            color: THEME.colors.text,
                          }}
                        >
                          {rec.targets.weekly}
                        </Text>
                      </View>
                      <View style={{ alignItems: "center" }}>
                        <Text
                          style={{
                            fontSize: 12,
                            color: THEME.colors.textSecondary,
                          }}
                        >
                          Monthly
                        </Text>
                        <Text
                          style={{
                            fontSize: 20,
                            fontWeight: "700",
                            color: THEME.colors.text,
                          }}
                        >
                          {rec.targets.monthly}
                        </Text>
                      </View>
                    </View>

                    {/* Earnings Info */}
                    <View
                      style={{
                        backgroundColor: THEME.colors.background,
                        padding: 12,
                        borderRadius: 8,
                        marginBottom: 16,
                      }}
                    >
                      <View
                        style={{
                          flexDirection: "row",
                          justifyContent: "space-between",
                          marginBottom: 8,
                        }}
                      >
                        <Text
                          style={{
                            color: THEME.colors.textSecondary,
                            fontSize: 12,
                          }}
                        >
                          Projected Bonus
                        </Text>
                        <Text
                          style={{
                            color: THEME.colors.primary,
                            fontWeight: "600",
                          }}
                        >
                          {formatKES(rec.bonus)}
                        </Text>
                      </View>
                      <View
                        style={{
                          flexDirection: "row",
                          justifyContent: "space-between",
                        }}
                      >
                        <Text
                          style={{
                            color: THEME.colors.textSecondary,
                            fontSize: 12,
                          }}
                        >
                          Total Earnings
                        </Text>
                        <Text
                          style={{
                            color: THEME.colors.text,
                            fontWeight: "700",
                            fontSize: 16,
                          }}
                        >
                          {formatKES(rec.totalProjected)}
                        </Text>
                      </View>
                    </View>

                    <TouchableOpacity
                      onPress={() => onApplyPlan(rec.targets)}
                      style={{
                        backgroundColor: THEME.colors.primary,
                        paddingVertical: 14,
                        paddingHorizontal: 20,
                        borderRadius: 10,
                        alignItems: "center",
                        opacity: saving ? 0.6 : 1,
                      }}
                      disabled={saving}
                    >
                      <Text
                        style={{
                          color: "#000",
                          fontWeight: "700",
                          fontSize: 16,
                        }}
                      >
                        {saving ? "Applying..." : "Apply This Plan"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            ) : (
              <View style={{ padding: 16 }}>
                <Text
                  style={{
                    fontSize: 14,
                    color: THEME.colors.textSecondary,
                    marginBottom: 24,
                    textAlign: "center",
                  }}
                >
                  Create your own custom target plan
                </Text>

                <View
                  style={{
                    backgroundColor: THEME.colors.surface,
                    padding: 20,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: THEME.colors.border,
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      marginBottom: 20,
                    }}
                  >
                    <Ionicons name="sparkles-outline" size={20} color={THEME.colors.primary} style={{ marginRight: 8 }} />
                    <Text
                      style={{
                        fontSize: 18,
                        fontWeight: "700",
                        color: THEME.colors.text,
                      }}
                    >
                      Custom Plan
                    </Text>
                  </View>

                  <View style={{ marginBottom: 20 }}>
                    <Text style={styles.label}>Daily Target</Text>
                    <TextInput
                      value={customDaily}
                      onChangeText={setCustomDaily}
                      keyboardType="numeric"
                      style={styles.input}
                      placeholder="Enter daily target"
                      placeholderTextColor={THEME.colors.textSecondary}
                    />
                  </View>

                  <View style={{ marginBottom: 20 }}>
                    <Text style={styles.label}>Weekly Target</Text>
                    <TextInput
                      value={customWeekly}
                      onChangeText={setCustomWeekly}
                      keyboardType="numeric"
                      style={styles.input}
                      placeholder="Enter weekly target"
                      placeholderTextColor={THEME.colors.textSecondary}
                    />
                  </View>

                  <View style={{ marginBottom: 24 }}>
                    <Text style={styles.label}>Monthly Target</Text>
                    <TextInput
                      value={customMonthly}
                      onChangeText={setCustomMonthly}
                      keyboardType="numeric"
                      style={styles.input}
                      placeholder="Enter monthly target"
                      placeholderTextColor={THEME.colors.textSecondary}
                    />
                  </View>

                  <TouchableOpacity
                    onPress={handleCustomSave}
                    style={{
                      backgroundColor: THEME.colors.primary,
                      paddingVertical: 14,
                      paddingHorizontal: 20,
                      borderRadius: 10,
                      alignItems: "center",
                      flexDirection: "row",
                      justifyContent: "center",
                      opacity: saving ? 0.6 : 1,
                    }}
                    disabled={saving}
                  >
                    <Ionicons name="flash-outline" size={18} color="#000" style={{ marginRight: 8 }} />
                    <Text
                      style={{
                        color: "#000",
                        fontWeight: "700",
                        fontSize: 16,
                      }}
                    >
                      {saving ? "Saving..." : "Save Custom Plan"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = {
  label: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: THEME.colors.text,
    marginBottom: 8,
  },
  input: {
    backgroundColor: THEME.colors.background,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    padding: 16,
    borderRadius: 12,
    color: THEME.colors.text,
    fontSize: 16,
  },
};
