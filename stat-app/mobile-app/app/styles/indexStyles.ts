import { StyleSheet } from "react-native";

export const styles=StyleSheet.create({
    bg:{flex: 1},
    safe:{flex: 1},

    header:{
        paddingHorizontal: 24,
        paddingVertical: 18,
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
    },

    logo:{
        fontSize: 34,
        fontWeight: "800",
        color: "#c1121f",
        letterSpacing: 1,
    },
    hero: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        paddingHorizontal: 20,
        paddingVertical: 30,
    },
    card:{
        width: "100%",
        maxWidth: 520,
        backgroundColor: "#ffffff",
        borderRadius: 20,
       paddingHorizontal: 28,
       paddingBottom: 28,
       paddingTop: 34,
        shadowColor: "#000",
        shadowOpacity: 0.12,
        shadowRadius: 18,
        shadowOffset: {width: 0, height: 12},
        elevation: 6,
        overflow: "hidden",
    },
    cardTopBorder: {
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: 6,
        backgroundColor: "#c1121f",
    },
    title:{
        marginTop: 8,
        fontSize: 28,
        fontWeight: "700",
        color: "#1f2933",
        textAlign: "center",
        marginBottom: 22,
        lineHeight: 34,
        paddingTop: 2,
    },

    actions: { gap: 12 },

    primaryBtn:{
        backgroundColor: "#c1121f",
        paddingVertical: 14,
        paddingHorizontal: 18,
        borderRadius: 14,
        alignItems: "center",
        shadowColor: "#c1121f",
        shadowOpacity: 0.35,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 6,},
        elevation: 4,
    },

    primaryBtnTetx: { color: "#ffffff", fontWeight:"800", fontSize: 16 },

    secondaryBtn: {
        backgroundColor: "transparent",
        borderColor: "#c1121f",
        borderWidth: 2,
        paddingVertical: 14,
        paddingHorizontal: 18,
        borderRadius: 14,
        alignItems: "center",
    },
    secondaryBtnText:{ color: "#c1121f", fontWeight: "800", fontSize: 16 },

    btnPressed: { transform: [{ translateY: -2 }]},
    btnPressedSecondary:{
        transform: [{ translateY: -2}],
        backgroundColor: "rgba(193, 18, 31, 0.06)",
    },
    subtitle:{
        fontSize: 15,
        color: "#4b5563",
        textAlign: "center",
        marginBottom: 22,
        lineHeight: 21,
    },
});
