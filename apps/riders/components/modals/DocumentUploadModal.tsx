// components/modals/DocumentUploadModal.tsx
import React, { useState } from "react";
import {
  View,
  TouchableOpacity,
  Alert,
  Dimensions,
  Image,
  ActivityIndicator,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { VStack } from "@/components/ui/vstack";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import { Heading } from "@/components/ui/heading";
import { Button, ButtonText } from "@/components/ui/button";
import { Pressable } from "@/components/ui/pressable";
import {
  Modal,
  ModalBackdrop,
  ModalContent,
  ModalHeader,
  ModalCloseButton,
  ModalBody,
  ModalFooter,
} from "@/components/ui/modal";
import Ionicons from "@expo/vector-icons/Ionicons";
import { ScrollView } from "@/components/ui/scroll-view";
import { THEME } from "@/theme/design";
import { useMutation } from "convex/react";
import { api } from "@repo/backend";

const { width: screenWidth, height: screenHeight } = Dimensions.get("window");

interface DocumentUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  documentType: "id" | "license";
  currentImageUrl?: string | null;
  onUploadSuccess: () => void;
}

export function DocumentUploadModal({
  isOpen,
  onClose,
  userId,
  documentType,
  currentImageUrl,
  onUploadSuccess,
}: DocumentUploadModalProps) {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const generateUploadUrl = useMutation(api.data.files.generateUploadUrl);
  const updateIdDocument = useMutation(api.data.files.uploadUserIdDocument);
  const updateLicenseDocument = useMutation(
    api.data.files.uploadUserLicenseDocument,
  );
  const deleteDocument = useMutation(api.data.files.deleteDocument);

  const documentTitle = documentType === "id" ? "ID Card" : "License";

  const handleImagePicker = async (source: "camera" | "gallery") => {
    try {
      let result;

      if (source === "camera") {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== "granted") {
          Alert.alert(
            "Permission needed",
            "Camera permission is required to take photos.",
          );
          return;
        }

        result = await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          aspect: [4, 3],
          quality: 0.8,
        });
      } else {
        const { status } =
          await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== "granted") {
          Alert.alert(
            "Permission needed",
            "Gallery permission is required to select photos.",
          );
          return;
        }

        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          aspect: [4, 3],
          quality: 0.8,
        });
      }

      if (!result.canceled) {
        setSelectedImage(result.assets[0].uri);
      }
    } catch (error) {
      console.error("Error picking image:", error);
      Alert.alert("Error", "Failed to select image");
    }
  };

  const handleUpload = async () => {
    if (!selectedImage) return;

    setIsUploading(true);
    try {
      const uploadUrl = await generateUploadUrl();

      const response = await fetch(selectedImage);
      const blob = await response.blob();

      const result = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": blob.type },
        body: blob,
      });

      const { storageId } = await result.json();

      if (documentType === "id") {
        await updateIdDocument({ userId: userId as any, storageId });
      } else {
        await updateLicenseDocument({ userId: userId as any, storageId });
      }

      Alert.alert("Success", `${documentTitle} uploaded successfully!`);
      onUploadSuccess();
      handleClose();
    } catch (error) {
      console.error("Upload error:", error);
      Alert.alert("Error", `Failed to upload ${documentTitle.toLowerCase()}`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async () => {
    Alert.alert(
      "Delete Document",
      `Are you sure you want to delete your ${documentTitle.toLowerCase()}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteDocument({ userId: userId as any, documentType });
              Alert.alert("Success", `${documentTitle} deleted successfully!`);
              onUploadSuccess();
              handleClose();
            } catch (error) {
              Alert.alert(
                "Error",
                `Failed to delete ${documentTitle.toLowerCase()}`,
              );
            }
          },
        },
      ],
    );
  };

  const handleClose = () => {
    setSelectedImage(null);
    onClose();
  };

  const ActionButton = ({
    onPress,
    icon,
    title,
    subtitle,
  }: {
    onPress: () => void;
    icon: any;
    title: string;
    subtitle?: string;
  }) => (
    <TouchableOpacity
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        padding: 16,
        backgroundColor: THEME.colors.surface,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: THEME.colors.border,
      }}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: THEME.colors.surfaceSecondary,
          alignItems: "center",
          justifyContent: "center",
          marginRight: 14,
        }}
      >
        <Ionicons name={icon as any} size={22} color={THEME.colors.text} />
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={{
            color: THEME.colors.text,
            fontSize: 15,
            fontWeight: "600",
          }}
        >
          {title}
        </Text>
        {subtitle && (
          <Text
            style={{
              color: THEME.colors.textSecondary,
              fontSize: 13,
              marginTop: 2,
            }}
          >
            {subtitle}
          </Text>
        )}
      </View>
      <Ionicons name="cloud-upload-outline" size={18} color={THEME.colors.textSecondary} />
    </TouchableOpacity>
  );

  return (
    <Modal isOpen={isOpen} onClose={handleClose} size="lg">
      <ModalBackdrop style={{ backgroundColor: "rgba(0,0,0,0.5)" }} />
      <ModalContent
        style={{
          backgroundColor: THEME.colors.surface,
          borderRadius: 20,
          margin: 16,
          maxHeight: screenHeight * 0.85,
        }}
      >
        <ModalHeader
          style={{
            paddingHorizontal: 20,
            paddingTop: 20,
            paddingBottom: 14,
            borderBottomWidth: 1,
            borderBottomColor: THEME.colors.border,
          }}
        >
          <HStack
            style={{ alignItems: "center", justifyContent: "space-between" }}
          >
            <HStack
              style={{
                flexDirection: "row",
                alignItems: "center",
                flex: 1,
                gap: 8,
              }}
            >
              <View
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 19,
                  backgroundColor: THEME.colors.surfaceSecondary,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="document-text-outline" size={18} color={THEME.colors.text} />
              </View>
              <VStack style={{ flex: 1 }}>
                <Heading
                  size="lg"
                  style={{
                    color: THEME.colors.text,
                    fontWeight: "700",
                    fontSize: 17,
                  }}
                >
                  Upload {documentTitle}
                </Heading>
                <Text
                  style={{
                    color: THEME.colors.textSecondary,
                    fontSize: 13,
                  }}
                >
                  {currentImageUrl
                    ? "Update your document"
                    : "Add your document"}
                </Text>
              </VStack>
            </HStack>
            <TouchableOpacity
              onPress={handleClose}
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                backgroundColor: THEME.colors.surfaceSecondary,
                alignItems: "center",
                justifyContent: "center",
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close" size={20} color={THEME.colors.textSecondary} />
            </TouchableOpacity>
          </HStack>
        </ModalHeader>

        <ModalBody style={{ padding: 20 }}>
          <ScrollView
            contentContainerStyle={{ flexGrow: 1 }}
            showsVerticalScrollIndicator={false}
          >
            <VStack style={{ flexDirection: "column", gap: 16 }}>
              {/* Current Image Display */}
              {(selectedImage || currentImageUrl) && (
                <View
                  style={{
                    borderRadius: 14,
                    overflow: "hidden",
                    borderWidth: 1,
                    borderColor: THEME.colors.border,
                  }}
                >
                  <Image
                    source={{ uri: selectedImage || currentImageUrl! }}
                    style={{
                      width: "100%",
                      height: 200,
                    }}
                    resizeMode="cover"
                  />
                  {selectedImage && (
                    <View
                      style={{
                        position: "absolute",
                        top: 10,
                        right: 10,
                        backgroundColor: THEME.colors.success,
                        borderRadius: 16,
                        paddingHorizontal: 10,
                        paddingVertical: 5,
                        flexDirection: "row",
                        alignItems: "center",
                      }}
                    >
                      <Ionicons name="checkmark-circle-outline" size={14} color="white" />
                      <Text
                        style={{
                          color: "white",
                          fontSize: 12,
                          fontWeight: "600",
                          marginLeft: 4,
                        }}
                      >
                        Ready to upload
                      </Text>
                    </View>
                  )}
                </View>
              )}

              {/* Image Selection Buttons - Only show if no image is selected and no current image */}
              {!selectedImage && !currentImageUrl && (
                <VStack style={{ flexDirection: "column", gap: 16 }}>
                  <View style={{ alignItems: "center" }}>
                    <Text
                      style={{
                        color: THEME.colors.text,
                        fontSize: 15,
                        fontWeight: "600",
                        textAlign: "center",
                        marginBottom: 2,
                      }}
                    >
                      Add Your {documentTitle}
                    </Text>
                    <Text
                      style={{
                        color: THEME.colors.textSecondary,
                        fontSize: 13,
                        textAlign: "center",
                      }}
                    >
                      Choose how you'd like to add your document
                    </Text>
                  </View>

                  <VStack
                    style={{
                      flexDirection: "column",
                      alignItems: "stretch",
                      gap: 8,
                    }}
                  >
                    <ActionButton
                      onPress={() => handleImagePicker("camera")}
                      icon="camera-outline"
                      title="Take Photo"
                      subtitle="Use your camera to capture the document"
                    />

                    <ActionButton
                      onPress={() => handleImagePicker("gallery")}
                      icon="image-outline"
                      title="Choose from Gallery"
                      subtitle="Select an existing photo from your device"
                    />
                  </VStack>
                </VStack>
              )}

              {/* Change Image Buttons - Show when there's a current image but no new selection */}
              {!selectedImage && currentImageUrl && (
                <VStack style={{ flexDirection: "column", gap: 16 }}>
                  <View style={{ alignItems: "center" }}>
                    <Text
                      style={{
                        color: THEME.colors.text,
                        fontSize: 15,
                        fontWeight: "600",
                        textAlign: "center",
                        marginBottom: 2,
                      }}
                    >
                      Update Your {documentTitle}
                    </Text>
                    <Text
                      style={{
                        color: THEME.colors.textSecondary,
                        fontSize: 13,
                        textAlign: "center",
                      }}
                    >
                      Replace your current document with a new one
                    </Text>
                  </View>

                  <VStack
                    style={{
                      flexDirection: "column",
                      alignItems: "stretch",
                      gap: 8,
                    }}
                  >
                    <ActionButton
                      onPress={() => handleImagePicker("camera")}
                      icon="camera-outline"
                      title="Take New Photo"
                      subtitle="Capture a new document with your camera"
                    />

                    <ActionButton
                      onPress={() => handleImagePicker("gallery")}
                      icon="image-outline"
                      title="Choose New from Gallery"
                      subtitle="Select a different photo from your device"
                    />
                  </VStack>
                </VStack>
              )}

              {/* Selected Image Actions */}
              {selectedImage && (
                <VStack style={{ flexDirection: "column", gap: 12 }}>
                  <View style={{ alignItems: "center" }}>
                    <Text
                      style={{
                        color: THEME.colors.text,
                        fontSize: 15,
                        fontWeight: "600",
                        textAlign: "center",
                        marginBottom: 2,
                      }}
                    >
                      Document Selected
                    </Text>
                    <Text
                      style={{
                        color: THEME.colors.textSecondary,
                        fontSize: 13,
                        textAlign: "center",
                      }}
                    >
                      Review your document and upload when ready
                    </Text>
                  </View>

                  <HStack
                    style={{
                      flex: 1,
                      flexDirection: "row",
                      width: "100%",
                      gap: 12,
                    }}
                  >
                    <Button
                      variant="outline"
                      onPress={() => setSelectedImage(null)}
                      style={{
                        flex: 1,
                        flexDirection: "row",
                        borderColor: THEME.colors.border,
                        borderWidth: 1.5,
                        borderRadius: 12,
                        height: 46,
                        paddingHorizontal: 20,
                      }}
                    >
                      <HStack
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        <Ionicons name="create-outline" size={16} color={THEME.colors.textSecondary} />
                        <ButtonText
                          style={{
                            color: THEME.colors.textSecondary,
                            fontWeight: "600",
                          }}
                        >
                          Change
                        </ButtonText>
                      </HStack>
                    </Button>

                    <Button
                      onPress={handleUpload}
                      disabled={isUploading}
                      style={{
                        flex: 1,
                        flexDirection: "row",
                        backgroundColor: THEME.colors.primary,
                        borderRadius: 12,
                        height: 46,
                        paddingHorizontal: 20,
                      }}
                    >
                      {isUploading ? (
                        <HStack
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 4,
                          }}
                        >
                          <ActivityIndicator size="small" color="white" />
                          <ButtonText
                            style={{ color: "white", fontWeight: "600" }}
                          >
                            Uploading...
                          </ButtonText>
                        </HStack>
                      ) : (
                        <HStack
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 4,
                          }}
                        >
                          <Ionicons name="cloud-upload-outline" size={18} color="white" />
                          <ButtonText
                            style={{ color: "white", fontWeight: "600" }}
                          >
                            Upload
                          </ButtonText>
                        </HStack>
                      )}
                    </Button>
                  </HStack>
                </VStack>
              )}

              {/* Upload Instructions */}
              <View
                style={{
                  backgroundColor: THEME.colors.surfaceSecondary,
                  padding: 16,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: THEME.colors.border,
                }}
              >
                <HStack
                // style={{
                //   flexDirection: "column",
                //   alignItems: "flex-start",
                //   gap: 8,
                // }}
                >
                  <View
                    style={{
                      // width: 28,
                      // height: 28,
                      borderRadius: 14,
                      // backgroundColor: THEME.colors.surface,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "flex-start",
                      gap: 8,
                      marginTop: 1,
                      marginBottom: 6,
                    }}
                  >
                    <Ionicons name="alert-circle-outline" size={16} color={THEME.colors.textSecondary} />
                    <Text
                      style={{
                        color: THEME.colors.text,
                        fontSize: 14,
                        fontWeight: "600",
                      }}
                    >
                      Document Guidelines
                    </Text>
                  </View>
                  <VStack style={{ flex: 1, flexDirection: "column", gap: 4 }}>
                    <VStack style={{ flexDirection: "column", gap: 4 }}>
                      {[
                        "Document must be clearly visible and legible",
                        "Include all corners within the frame",
                        "Avoid glare, shadows, and blurry areas",
                        "Ensure document is valid and not expired",
                      ].map((guideline, index) => (
                        <HStack
                          key={index}
                          style={{
                            flexDirection: "row",
                            alignItems: "flex-start",
                            gap: 6,
                          }}
                        >
                          <Text
                            style={{
                              color: THEME.colors.textSecondary,
                              fontSize: 12,
                              marginTop: 1,
                            }}
                          >
                            •
                          </Text>
                          <Text
                            style={{
                              color: THEME.colors.textSecondary,
                              fontSize: 12,
                              lineHeight: 17,
                              flex: 1,
                            }}
                          >
                            {guideline}
                          </Text>
                        </HStack>
                      ))}
                    </VStack>
                  </VStack>
                </HStack>
              </View>
            </VStack>
          </ScrollView>
        </ModalBody>

        <ModalFooter
          style={{
            paddingHorizontal: 20,
            paddingBottom: 20,
            paddingTop: 14,
            borderTopWidth: 1,
            borderTopColor: THEME.colors.border,
          }}
        >
          <HStack style={{ flexDirection: "row", width: "100%", gap: 12 }}>
            {/* Delete button - only show if there's an existing image */}
            {currentImageUrl && !selectedImage && (
              <Button
                variant="outline"
                onPress={handleDelete}
                style={{
                  flex: 1,
                  borderColor: THEME.colors.error,
                  borderWidth: 1.5,
                  borderRadius: 12,
                  height: 46,
                }}
              >
                <HStack
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <Ionicons name="trash-outline" size={16} color={THEME.colors.error} />
                  <ButtonText
                    style={{
                      color: THEME.colors.error,
                      fontWeight: "600",
                    }}
                  >
                    Delete
                  </ButtonText>
                </HStack>
              </Button>
            )}

            {/* Cancel/Close button */}
            <Button
              variant="outline"
              onPress={handleClose}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "flex-end",
                borderWidth: 1.5,
                borderColor: THEME.colors.border,
                backgroundColor: THEME.colors.surface,

                borderRadius: 12,
                paddingHorizontal: 20,
                height: 46,
              }}
            >
              <ButtonText
                style={{
                  fontWeight: "600",
                  color: THEME.colors.textSecondary,
                }}
              >
                Cancel
              </ButtonText>
            </Button>
          </HStack>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
