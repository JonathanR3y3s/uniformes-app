#!/usr/bin/env python3
"""Token Optimizer para Uniformes App - Reduce costos API"""

import json
from llmlingua import PromptCompressor

def optimize_prompt(prompt_text):
    """Comprime un prompt eliminando tokens innecesarios"""
    try:
        compressor = PromptCompressor()
        compressed = compressor.compress_prompt(prompt_text)
        
        original_tokens = len(prompt_text.split())
        compressed_tokens = len(str(compressed).split())
        savings = ((original_tokens - compressed_tokens) / original_tokens * 100)
        
        return {
            "original": prompt_text,
            "compressed": str(compressed),
            "original_tokens": original_tokens,
            "compressed_tokens": compressed_tokens,
            "savings_percent": round(savings, 2)
        }
    except Exception as e:
        return {"error": str(e)}

if __name__ == "__main__":
    test_prompt = "Soy un usuario que necesita ver el inventario de uniformes en la tienda"
    result = optimize_prompt(test_prompt)
    print(json.dumps(result, indent=2, ensure_ascii=False))
