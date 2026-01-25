#!/usr/bin/env python3
"""
Visualize Molecular Orbitals from Molden file using PySCF and Plotly
Interactive 3D visualization with isosurfaces
"""

import numpy as np
from pyscf.tools import molden
import plotly.graph_objects as go
from skimage import measure


def load_molden(filename):
    """Load molden file and return mol object and MO coefficients."""
    mol, mo_energy, mo_coeff, mo_occ, irrep_labels, spins = molden.load(filename)
    return mol, mo_energy, mo_coeff, mo_occ


def eval_ao_on_grid(mol, coords):
    """Evaluate atomic orbitals on a grid of coordinates."""
    ao_values = mol.eval_gto('GTOval_sph', coords)
    return ao_values


def eval_mo_on_grid(mol, mo_coeff, mo_idx, grid_points):
    """Evaluate a specific MO on a 3D grid."""
    ao_values = eval_ao_on_grid(mol, grid_points)
    mo_values = ao_values @ mo_coeff[:, mo_idx]
    return mo_values


def create_grid(mol, padding=3.0, npoints=60):
    """Create a 3D grid around the molecule."""
    coords = mol.atom_coords()
    
    xmin, ymin, zmin = coords.min(axis=0) - padding
    xmax, ymax, zmax = coords.max(axis=0) + padding
    
    x = np.linspace(xmin, xmax, npoints)
    y = np.linspace(ymin, ymax, npoints)
    z = np.linspace(zmin, zmax, npoints)
    
    return x, y, z


def visualize_mo(mol, mo_coeff, mo_idx, mo_energy, mo_occ, isovalue=0.02, npoints=60):
    """
    Visualize a molecular orbital using Plotly.
    
    Parameters:
    -----------
    mol : pyscf.gto.Mole object
    mo_coeff : MO coefficient matrix
    mo_idx : Index of MO to visualize (0-based)
    mo_energy : Array of MO energies
    mo_occ : Array of MO occupations
    isovalue : Isosurface value for visualization
    npoints : Number of grid points in each dimension
    """
    # Create grid
    x, y, z = create_grid(mol, padding=4.0, npoints=npoints)
    
    # Create meshgrid for coordinates
    X, Y, Z = np.meshgrid(x, y, z, indexing='ij')
    grid_points = np.vstack([X.ravel(), Y.ravel(), Z.ravel()]).T
    
    # Evaluate MO on grid
    print(f"  Evaluating MO on {npoints}x{npoints}x{npoints} grid...")
    mo_values = eval_mo_on_grid(mol, mo_coeff, mo_idx, grid_points)
    mo_values = mo_values.reshape(X.shape)
    
    # Create figure
    fig = go.Figure()
    
    spacing = (x[1]-x[0], y[1]-y[0], z[1]-z[0])
    
    # Add positive isosurface (blue)
    try:
        verts_pos, faces_pos, _, _ = measure.marching_cubes(
            mo_values, level=isovalue, spacing=spacing
        )
        verts_pos[:, 0] += x[0]
        verts_pos[:, 1] += y[0]
        verts_pos[:, 2] += z[0]
        
        fig.add_trace(go.Mesh3d(
            x=verts_pos[:, 0], y=verts_pos[:, 1], z=verts_pos[:, 2],
            i=faces_pos[:, 0], j=faces_pos[:, 1], k=faces_pos[:, 2],
            color='blue', opacity=0.6, name='+ lobe'
        ))
        print(f"  Added positive isosurface ({len(verts_pos)} vertices)")
    except ValueError:
        print(f"  No positive isosurface found at isovalue {isovalue}")
    
    # Add negative isosurface (red)
    try:
        verts_neg, faces_neg, _, _ = measure.marching_cubes(
            mo_values, level=-isovalue, spacing=spacing
        )
        verts_neg[:, 0] += x[0]
        verts_neg[:, 1] += y[0]
        verts_neg[:, 2] += z[0]
        
        fig.add_trace(go.Mesh3d(
            x=verts_neg[:, 0], y=verts_neg[:, 1], z=verts_neg[:, 2],
            i=faces_neg[:, 0], j=faces_neg[:, 1], k=faces_neg[:, 2],
            color='red', opacity=0.6, name='- lobe'
        ))
        print(f"  Added negative isosurface ({len(verts_neg)} vertices)")
    except ValueError:
        print(f"  No negative isosurface found at isovalue {-isovalue}")
    
    # Add atoms as spheres
    atom_colors = {'O': 'red', 'H': 'white', 'C': 'gray', 'N': 'blue', 'S': 'yellow'}
    atom_sizes = {'O': 15, 'H': 10, 'C': 15, 'N': 15, 'S': 18}
    
    coords = mol.atom_coords()
    symbols = [mol.atom_symbol(i) for i in range(mol.natm)]
    
    for i, (coord, sym) in enumerate(zip(coords, symbols)):
        fig.add_trace(go.Scatter3d(
            x=[coord[0]], y=[coord[1]], z=[coord[2]],
            mode='markers+text',
            marker=dict(
                size=atom_sizes.get(sym, 12), 
                color=atom_colors.get(sym, 'gray'),
                line=dict(width=1, color='black')
            ),
            text=[sym],
            textposition='top center',
            name=f'{sym}{i+1}',
            showlegend=False
        ))
    
    # Add bonds (simple distance-based)
    bond_threshold = 3.5  # Bohr
    for i in range(mol.natm):
        for j in range(i+1, mol.natm):
            dist = np.linalg.norm(mol.atom_coord(i) - mol.atom_coord(j))
            if dist < bond_threshold:
                ci, cj = mol.atom_coord(i), mol.atom_coord(j)
                fig.add_trace(go.Scatter3d(
                    x=[ci[0], cj[0]], y=[ci[1], cj[1]], z=[ci[2], cj[2]],
                    mode='lines',
                    line=dict(color='gray', width=5),
                    showlegend=False
                ))
    
    # Determine orbital type
    n_occ = int(sum(mo_occ) // 2)
    if mo_idx < n_occ:
        occ_str = "occupied"
        if mo_idx == n_occ - 1:
            occ_str = "HOMO"
    else:
        occ_str = "virtual"
        if mo_idx == n_occ:
            occ_str = "LUMO"
    
    # Update layout
    fig.update_layout(
        title=dict(
            text=f'MO {mo_idx + 1} ({occ_str})<br>Energy: {mo_energy[mo_idx]:.4f} Ha ({mo_energy[mo_idx]*27.211:.2f} eV)',
            x=0.5,
            font=dict(size=16)
        ),
        scene=dict(
            xaxis_title='X (Bohr)',
            yaxis_title='Y (Bohr)',
            zaxis_title='Z (Bohr)',
            aspectmode='data',
            camera=dict(
                eye=dict(x=1.5, y=1.5, z=1.5)
            )
        ),
        showlegend=True,
        legend=dict(x=0.85, y=0.95),
        margin=dict(l=0, r=0, t=50, b=0)
    )
    
    return fig


def visualize_all_occupied(mol, mo_coeff, mo_energy, mo_occ, isovalue=0.02, save_html=True):
    """Visualize all occupied MOs."""
    n_occ = int(sum(mo_occ) // 2)
    
    figures = []
    for i in range(n_occ):
        print(f"\nGenerating MO {i+1} of {n_occ}...")
        fig = visualize_mo(mol, mo_coeff, i, mo_energy, mo_occ, isovalue=isovalue)
        figures.append(fig)
        
        if save_html:
            filename = f'mo_{i+1}.html'
            fig.write_html(filename)
            print(f"  Saved to {filename}")
    
    return figures


def print_mo_summary(mo_energy, mo_occ):
    """Print a summary of all MOs."""
    n_occ = int(sum(mo_occ) // 2)
    
    print("\n" + "="*60)
    print("MOLECULAR ORBITAL SUMMARY")
    print("="*60)
    print(f"{'MO':<5} {'Energy (Ha)':<15} {'Energy (eV)':<12} {'Type':<10}")
    print("-"*60)
    
    for i, (e, occ) in enumerate(zip(mo_energy, mo_occ)):
        if i < n_occ:
            mo_type = "occupied"
            if i == n_occ - 1:
                mo_type = "HOMO"
        else:
            mo_type = "virtual"
            if i == n_occ:
                mo_type = "LUMO"
        
        print(f"{i+1:<5} {e:<15.6f} {e*27.211:<12.2f} {mo_type:<10}")
        
        # Add separator between occupied and virtual
        if i == n_occ - 1:
            print("-"*60)
    
    print("="*60)
    gap = mo_energy[n_occ] - mo_energy[n_occ-1]
    print(f"HOMO-LUMO gap: {gap:.4f} Ha ({gap*27.211:.2f} eV)")
    print("="*60)


# Main execution
if __name__ == "__main__":
    # Load molden file
    molden_file = "/Users/bpham/MOplots/molden_pyscf/h2o_hf.molden"
    
    print("Loading molden file...")
    mol, mo_energy, mo_coeff, mo_occ = load_molden(molden_file)
    
    print(f"\nLoaded: {molden_file}")
    print(f"Number of atoms: {mol.natm}")
    print(f"Number of MOs: {len(mo_energy)}")
    print(f"Number of occupied MOs: {int(sum(mo_occ)//2)}")
    
    # Print MO summary
    print_mo_summary(mo_energy, mo_occ)
    
    # Visualize specific MO
    # Change mo_index to visualize different orbitals:
    #   0 = MO 1 (O 1s core)
    #   1 = MO 2 (O-H bonding)
    #   2 = MO 3 (O-H bonding)
    #   3 = MO 4 (O-H bonding)
    #   4 = MO 5 (HOMO - O lone pair)
    #   5 = MO 6 (LUMO)
    
    mo_index = 0  # HOMO (MO 5)
    
    print(f"\nVisualizing MO {mo_index + 1}...")
    fig = visualize_mo(mol, mo_coeff, mo_index, mo_energy, mo_occ, 
                       isovalue=0.02, npoints=50)
    
    # Save to HTML and show
    output_file = f'mo_{mo_index + 1}.html'
    fig.write_html(output_file)
    print(f"\nSaved to {output_file}")
    
    # Open in browser
    fig.show()
    
    # Uncomment below to generate all occupied MOs:
    # print("\nGenerating all occupied MOs...")
    # visualize_all_occupied(mol, mo_coeff, mo_energy, mo_occ, isovalue=0.02)
