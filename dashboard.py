#!/usr/bin/env python3
"""Dashboard Streamlit para Uniformes App"""

import streamlit as st
from datetime import datetime

st.set_page_config(page_title="Uniformes Dashboard", layout="wide")

st.title("📊 Dashboard - Uniformes App")
st.markdown("---")

col1, col2, col3 = st.columns(3)
with col1:
    st.metric("Total Entregas", "142", "+12%")
with col2:
    st.metric("Stock Activo", "1,240 piezas", "-3%")
with col3:
    st.metric("Tiendas", "8", "✓")

st.markdown("---")
st.subheader("📈 Últimos Cambios")
st.info("✅ Herramientas instaladas y listas para usar")
st.success("✅ Rama tuning-v2 creada (ORIGINAL SEGURO)")
st.warning("⚡ Optimizaciones de token disponibles")

